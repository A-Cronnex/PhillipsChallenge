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

/**
 * Local inference.
 *
 * Every method may reject; docs/ai-agent.md §13 requires the original input to
 * be preserved and the user informed, which the orchestrator does.
 */
export interface AiRuntime {
  /** Whether the models are loaded and inference can be attempted. */
  isReady(): Promise<boolean>;
  /** Loads models. Slow on first run; the UI must show progress. */
  prepare(): Promise<void>;
  extractFromText(request: TextExtractionRequest): Promise<AgentExtraction>;
  extractFromImage(request: ImageExtractionRequest): Promise<AgentExtraction>;
  /** Speech to text. Returns text in the language spoken. */
  transcribe(audioPath: string): Promise<string>;
  /** Optional for older adapters; UI reports unavailable rather than faking partials. */
  openSpeechSession?(onPartial: (text: string) => void): Promise<SpeechSession>;
}

/** Persistence of the conversation itself (docs/domain-model.md §10). */
export interface ConversationRepository {
  save(conversation: ConversationState): Promise<void>;
  latest(userId: string): Promise<ConversationState | null>;
  finalize(conversation: ConversationState, observation: import('../../observations/domain/observation').NewObservation): Promise<void>;
}
