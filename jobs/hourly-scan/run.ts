import "@/lib/config/load-env";
import { getJobRepository } from "@/lib/data";
import { runHourlyScan } from "./index";

getJobRepository()
  .then((repo) => runHourlyScan(repo, { log: (m) => console.log(`[scan] ${m}`) }))
  .then((run) => {
    console.log(JSON.stringify(run, null, 2));
    process.exit(run.status === "failed" ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
