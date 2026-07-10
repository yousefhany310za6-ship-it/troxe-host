import { db, testDatabase } from "../config/database.js";
import { hashPassword } from "../api/middleware/auth.js";

async function seed() {
  console.log("Seeding database...");

  const ok = await testDatabase();
  if (!ok) {
    console.error("Cannot seed without database connection");
    process.exit(1);
  }

  // Create default location
  const locationResult = await db.query(
    `INSERT INTO locations (name, description)
     VALUES ('Default', 'Default location')
     ON CONFLICT DO NOTHING
     RETURNING id`
  );

  let locationId: string;
  if (locationResult.rows.length > 0) {
    locationId = locationResult.rows[0].id;
  } else {
    const existing = await db.query("SELECT id FROM locations LIMIT 1");
    locationId = existing.rows[0].id;
  }

  // Create admin user
  const adminPassword = await hashPassword("admin12345");
  const adminResult = await db.query(
    `INSERT INTO users (username, email, password_hash, root_admin)
     VALUES ('admin', 'admin@troxe.dev', $1, true)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [adminPassword]
  );

  if (adminResult.rows.length > 0) {
    console.log("Created admin user: admin@troxe.dev / admin12345");
  }

  // Create default nests
  const nests = [
    { name: "Minecraft", description: "Minecraft game servers" },
    { name: "Source Engine", description: "Source engine game servers" },
    { name: "Rust", description: "Rust game servers" },
    { name: "Valheim", description: "Valheim game servers" },
    { name: "Other", description: "Other game servers" },
  ];

  for (const nest of nests) {
    await db.query(
      `INSERT INTO nests (name, description)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [nest.name, nest.description]
    );
  }

  // Get nest IDs
  const nestResults = await db.query("SELECT id, name FROM nests");
  const nestMap = new Map(
    nestResults.rows.map((r: any) => [r.name, r.id])
  );

  // Create default eggs
  const eggs = [
    {
      name: "Minecraft Paper",
      nest: "Minecraft",
      image: "ghcr.io/pterodactyl/yolks:java_17",
      startup:
        'java -Xms${SERVER_MEMORY}M -Xmx${SERVER_MEMORY}M -jar server.jar nogui',
      env: { SERVER_MEMORY: "1024" },
    },
    {
      name: "Minecraft Vanilla",
      nest: "Minecraft",
      image: "ghcr.io/pterodactyl/yolks:java_17",
      startup:
        'java -Xms${SERVER_MEMORY}M -Xmx${SERVER_MEMORY}M -jar server.jar nogui',
      env: { SERVER_MEMORY: "1024" },
    },
    {
      name: "Rust (Oxide)",
      nest: "Rust",
      image: "ghcr.io/pterodactyl/yolks:rust",
      startup: "./rust_server -batchmode -nographics +server.port ${SERVER_PORT}",
      env: { SERVER_PORT: "28015" },
    },
    {
      name: "Valheim",
      nest: "Valheim",
      image: "ghcr.io/pterodactyl/yolks:java_17",
      startup:
        "./start_server.sh -name ${SERVER_NAME} -port ${SERVER_PORT} -world ${WORLD_NAME}",
      env: {
        SERVER_NAME: "My Server",
        SERVER_PORT: "2456",
        WORLD_NAME: "Dedicated",
      },
    },
  ];

  for (const egg of eggs) {
    const nestId = nestMap.get(egg.nest);
    if (!nestId) continue;

    await db.query(
      `INSERT INTO eggs (name, nest_id, docker_image, startup_command, variables)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        egg.name,
        nestId,
        egg.image,
        egg.startup,
        JSON.stringify(
          Object.entries(egg.env).map(([name, defaultValue]) => ({
            name,
            defaultValue,
            envVariable: name,
            type: "string",
          }))
        ),
      ]
    );
  }

  console.log("Seed complete!");
  console.log("");
  console.log("Admin credentials:");
  console.log("  Email: admin@troxe.dev");
  console.log("  Password: admin12345");
  console.log("");
  console.log("Default eggs created:");
  console.log("  - Minecraft Paper");
  console.log("  - Minecraft Vanilla");
  console.log("  - Rust (Oxide)");
  console.log("  - Valheim");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
