/**
 * Generate the QVAC worker bundle for this runner.
 *
 * The bundle and its generated entry file are build outputs, not source. The
 * archived lab committed an 11 MB bundle whose entry file had absolute local
 * paths baked into every import, which is exactly what the repository decision
 * rules out. Here the bundle is generated on demand and gitignored.
 *
 * qvac.config.json restricts this to the llamacpp-completion plugin, since the
 * lab only does text completion. Leaving the plugin list empty would bundle all
 * eleven built-ins.
 */
import { bundleSdk } from "@qvac/sdk/commands";

const IOS_HOSTS = ["ios-arm64", "ios-arm64-simulator"];

const result = await bundleSdk({
  projectRoot: new URL("../", import.meta.url).pathname,
  hosts: IOS_HOSTS,
});

console.log("bundle:   ", result.bundlePath);
console.log("plugins:  ", result.plugins.join(", "));
console.log("addons:   ", result.addons.length);
console.log("manifest: ", result.manifestPath);


