/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// macOS doesn't let Chrome's helper processes read files under ~/Desktop (the GPU process crashes with "icudtl.dat
// not found"), so this project keeps Remotion's headless Chrome in ~/Library/Caches instead of node_modules.
// How to move it there: docs/marketing/launch-video.md ("Mac gotcha").
const chrome = join(homedir(), "Library/Caches/club-nyc-remotion/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if (existsSync(chrome)) Config.setBrowserExecutable(chrome);
