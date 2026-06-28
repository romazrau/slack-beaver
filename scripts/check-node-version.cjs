const fs = require("node:fs");
const path = require("node:path");

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const expectedMajor = Number(
  process.env.SLACK_BEAVER_REQUIRED_NODE_MAJOR ??
    packageJson.engines.node.match(/>=\s*(\d+)/)?.[1]
);
const actualMajor = Number(process.versions.node.split(".")[0]);

if (!Number.isInteger(expectedMajor)) {
  console.error("Unable to determine the required Node.js major version from package.json.");
  process.exit(1);
}

if (actualMajor !== expectedMajor) {
  console.error(
    [
      `Slack Beaver requires Node.js ${expectedMajor}.x.`,
      `Current Node.js is ${process.version} with NODE_MODULE_VERSION ${process.versions.modules}.`,
      "",
      "Run:",
      "  nvm use",
      "  npm rebuild better-sqlite3",
      "",
      "Then retry the npm command."
    ].join("\n")
  );
  process.exit(1);
}
