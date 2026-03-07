import { getDb } from "~/db";
import { rebuildPeople } from "~/search/rebuild-people";

const db = getDb();
console.log("Rebuilding people table...");
rebuildPeople(db);
const count = db.prepare("SELECT COUNT(*) as count FROM people").get() as { count: number };
console.log(`People table rebuilt: ${count.count} people`);
