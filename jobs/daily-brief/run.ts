import "@/lib/config/load-env";
import { getJobRepository } from "@/lib/data";
import { runDailyBrief } from "./index";

getJobRepository()
  .then((repo) => runDailyBrief(repo))
  .then((brief) => {
    console.log(brief.summaryMarkdown);
    console.log(`\nemail: ${brief.delivery ? JSON.stringify(brief.delivery) : "no recipients configured (DAILY_BRIEF_RECIPIENTS)"}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
