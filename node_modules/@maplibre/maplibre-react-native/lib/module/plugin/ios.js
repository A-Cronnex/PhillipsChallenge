"use strict";

import { CodeGenerator, withPodfile, withXcodeProject } from "expo/config-plugins";
const {
  mergeContents,
  removeGeneratedContents
} = CodeGenerator;
const TAG_PREFIX = `@maplibre/maplibre-react-native`;

/**
 * Only the post-install block is required, the post installer block is used for
 * SPM (Swift Package Manager) which Expo doesn't currently support.
 */
export function applyPodfilePostInstall(contents) {
  const result = mergeContents({
    tag: `${TAG_PREFIX}:post-install`,
    src: contents,
    newSrc: `    $MLRN.post_install(installer)`,
    anchor: /post_install do \|installer\|/,
    offset: 1,
    comment: "#"
  });
  if (result.didMerge || result.didClear) {
    return result.contents;
  }
  return contents;
}
const withPodfilePostInstall = config => {
  return withPodfile(config, c => {
    c.modResults.contents = applyPodfilePostInstall(c.modResults.contents);
    return c;
  });
};
export const applyPodfileGlobalVariables = (contents, props) => {
  const tag = `${TAG_PREFIX}:global-variables`;
  const globalVariables = [];
  if (props?.ios?.nativeVersion) {
    globalVariables.push(`$MLRN_NATIVE_VERSION = "${props.ios.nativeVersion}"`);
  }
  if (props?.ios?.spmSpec) {
    globalVariables.push(`$MLRN_SPM_SPEC = ${props.ios.spmSpec}`);
  }
  if (globalVariables.length > 0) {
    return mergeContents({
      tag,
      src: contents,
      newSrc: globalVariables.join("\n"),
      anchor: /target .+ do/,
      offset: 0,
      comment: "#"
    }).contents;
  }
  const modified = removeGeneratedContents(contents, tag);
  return modified ?? contents;
};
export const withPodfileGlobalVariables = (config, props) => {
  return withPodfile(config, c => {
    c.modResults.contents = applyPodfileGlobalVariables(c.modResults.contents, props);
    return c;
  });
};

/**
 * Set the Debug Information Format to DWARF with dSYM File during EAS Build for
 * Managed App https://github.com/expo/eas-cli/issues/968
 *
 * Set `artifactPath` in `eas.json`:
 *
 * ```json
 * "ios": {
 *    "artifactPath": "ios/build/*"
 *  }
 * ```
 */
const withDwarfDsym = config => {
  return withXcodeProject(config, c => {
    c.modResults.debugInformationFormat = "dwarf-with-dsym";
    return c;
  });
};
export const ios = {
  withPodfilePostInstall,
  withPodfileGlobalVariables,
  withDwarfDsym
};
//# sourceMappingURL=ios.js.map