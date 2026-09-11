/**
 * Ports the conversational agent depends on.
 *
 * The application layer talks to these, never to `@qvac/sdk` directly
 * (CLAUDE.md §5). That is also what makes the agent testable at all: QVAC does
 * not run on an emulator (docs/ai-agent.md §12), so every test off-device
 * substitutes an implementation of `AiRuntime`.
 */
import type { CaptureField } from '../domain/fields';
import type { AgentExtraction } from '../domain/extraction';
import type { ConversationState } from '../domain/conversation';

export type UserLanguage = 'es' | 'en';
export type AgentActivity = 'idle' | 'listening' | 'thinking' | 'responding';

export interface SpeechSession {
  /** 16 kHz, mono, signed 16-bit little-endian PCM. */
  write(chunk: Uint8Array): void;
  finish(): Promise<string>;
  cancel(): void;
  result: Promise<string>;
}

export interface TextExtractionRequest {
  /** What the user said or typed, in their own language. */
  text: string;
  language: UserLanguage;
  /** Fields still missing, so the model is asked for those and not the rest. */
  targetFields: CaptureField[];
  onResponding?: () => void;
}

export interface ImageExtractionRequest {
  /** Local file path. Never a URL — the image must not leave the device. */
  imagePath: string;
  targetFields: CaptureField[];
  language: UserLanguage;
}

/** One set of weights the device needs in order to work offline. */
export interface ModelAsset {
  /** Registry name. Stable identity, not shown to the user. */
  name: string;
  /** What the user sees, e.g. "MedPsy-1.7B". */
  label: string;
  /** Already on this device. */
  cached: boolean;
  /** Size on disk once downloaded. 0 when the registry reports none. */
  bytes: number;
}

/**
 * What is and is not already downloaded.
 *
 * Models are fetched once and then reused offline, so the user has to be told
 * *before* going to the field whether this device still needs a download
 * (product requirement, 2026-09-10).
 */
export interface ModelReadiness {
  assets: ModelAsset[];
  missing: ModelAsset[];
  /** Bytes still to download. */
  missingBytes: number;
  allCached: boolean;
}

/** Aggregate progress across every model `prepare` still has to fetch. */
export interface PrepareProgress {
  /** 0–1 over the whole preparation, not per file. */
  fraction: number;
  downloadedBytes: number;
  totalBytes: number;
  /** Label of the model being downloaded, or null while loading into memory. */
  current: string | null;
}

/**
 * Local inference.
 *
 * Every method may reject; docs/ai-agent.md §13 requires the original input to
 * be preserved and the user informed, which the orchestrator does.
 */
export interface AiRuntime {
  /** Whether the models are loaded and inference can be attempted. */
  isReady(): Promise<boolean>;
  /**
   * Which weights are already on this device. Never downloads anything.
   *
   * Optional so that the many `AiRuntime` test doubles do not all have to
   * implement it; the UI degrades to "no readiness information" when absent.
   */
  modelReadiness?(): Promise<ModelReadiness>;
  /**
   * Downloads any missing weights, then loads what the agent needs to answer.
   *
   * Slow on first run — that is the whole reason `onProgress` exists. On a
   * device that already has the weights it only loads them, and reports no
   * download progress.
   */
  prepare(onProgress?: (progress: PrepareProgress) => void): Promise<void>;
  extractFromText(request: TextExtractionRequest): Promise<AgentExtraction>;
  extractFromImage(request: ImageExtractionRequest): Promise<AgentExtraction>;
  /** Speech to text. Returns text in the language spoken. */
  transcribe(audioPath: string): Promise<string>;
  /** Optional for older adapters; UI reports unavailable rather than faking partials. */
  openSpeechSession?(onPartial: (text: string) => void): Promise<SpeechSession>;
}

/**
 * Why a conversation could not be discarded.
 *
 * Deleting is refused rather than done partially, because every alternative
 * loses something the rest of the system promises to keep:
 *
 * - `has_observation` — the observation it produced is historical and must not
 *   be deleted to simplify the model (CLAUDE.md §9). The schema would keep the
 *   observation and null its `conversation_id`, which silently destroys the
 *   provenance link `docs/domain-model.md` §12 defines.
 * There is deliberately no "already uploaded" refusal. Conversations are
 * uploaded but never downloaded (`docs/sync-api.md` §2), so discarding the
 * local copy is final: the server keeps its own as the provenance of the
 * observation, and nothing restores it here. Refusing would have blocked a
 * user from clearing their own chat to protect a record they cannot see.
 * - `sync_in_flight` — a run has claimed the row; deleting under it would
 *   strand the upload mid-batch.
 */
export type ConversationDeleteRefusal =
  | 'has_observation'
  | 'sync_in_flight';

export type ConversationDeleteResult =
  | { status: 'deleted' }
  | { status: 'refused'; reason: ConversationDeleteRefusal };

/** Persistence of the conversation itself (docs/domain-model.md §10). */
export interface ConversationRepository {
  save(conversation: ConversationState): Promise<void>;
  latest(userId: string): Promise<ConversationState | null>;
  finalize(conversation: ConversationState, observation: import('../../observations/domain/observation').NewObservation): Promise<void>;
  /**
   * Discards the local copy of a conversation.
   *
   * Never touches observations. Returns a refusal instead of deleting
   * partially — see `ConversationDeleteRefusal`.
   */
  deleteConversation(conversationId: string): Promise<ConversationDeleteResult>;
}
