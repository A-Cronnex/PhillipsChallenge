import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '../../lib/id';

/** Picker/recorder paths are cache files. Copy before storing a reference. */
export function retainArtifact(uri: string, kind: 'image' | 'audio'): string {
  const directory = new Directory(Paths.document, 'capture-artifacts');
  directory.create({ idempotent: true, intermediates: true });
  const extension = uri.split('.').pop()?.split('?')[0];
  const safeExtension = extension && /^[a-z0-9]{1,5}$/i.test(extension) ? extension : kind === 'image' ? 'jpg' : 'm4a';
  const target = new File(directory, `${newId()}.${safeExtension}`);
  new File(uri).copy(target);
  return target.uri;
}
