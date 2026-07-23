import { createDataSource } from "./data-source";

async function main() {
  const command = process.argv[2] ?? "run";
  const dataSource = await createDataSource().initialize();
  try {
    if (command === "run") {
      const migrations = await dataSource.runMigrations();
      console.log(`Applied ${migrations.length} migration(s).`);
    } else if (command === "revert") {
      await dataSource.undoLastMigration();
      console.log("Reverted last migration.");
    } else if (command === "show") {
      const pending = await dataSource.showMigrations();
      console.log(pending ? "Pending migrations exist." : "Database is up to date.");
    } else {
      throw new Error(`Unknown migration command: ${command}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
