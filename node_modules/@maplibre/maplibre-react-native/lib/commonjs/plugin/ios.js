"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.applyPodfileGlobalVariables = void 0;
exports.applyPodfilePostInstall = applyPodfilePostInstall;
exports.withPodfileGlobalVariables = exports.ios = void 0;
var _configPlugins = require("expo/config-plugins");
const {
  mergeContents,
  removeGeneratedContents
} = _configPlugins.CodeGenerator;
const TAG_PREFIX = `@maplibre/maplibre-react-native`;

/**
 * Only the post-install block is required, the post installer block is used for
 * SPM (Swift Package Manager) which Expo doesn't currently support.
 */
function applyPodfilePostInstall(contents) {
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
  return (0, _configPlugins.withPodfile)(config, c => {
    c.modResults.contents = applyPodfilePostInstall(c.modResults.contents);
    return c;
  });
};
const applyPodfileGlobalVariables = (contents, props) => {
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
exports.applyPodfileGlobalVariables = applyPodfileGlobalVariables;
const withPodfileGlobalVariables = (config, props) => {
  return (0, _configPlugins.withPodfile)(config, c => {
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
exports.withPodfileGlobalVariables = withPodfileGlobalVariables;
const withDwarfDsym = config => {
  return (0, _configPlugins.withXcodeProject)(config, c => {
    c.modResults.debugInformationFormat = "dwarf-with-dsym";
    return c;
  });
};
const ios = exports.ios = {
  withPodfilePostInstall,
  withPodfileGlobalVariables,
  withDwarfDsym
};
//# sourceMappingURL=ios.js.map