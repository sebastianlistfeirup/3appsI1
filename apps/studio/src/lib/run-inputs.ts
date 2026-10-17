import type { Project, Task } from "./model";
import {
  correctionInputVersionIds,
  latestInputVersionIds,
} from "./input-selection";

/** A correction starts from known input and the reviewed output. It does not
 * silently switch to files uploaded after that review. The editor can choose. */
export function initialRunInputs(project: Project, task: Task): string[] {
  if (task.correctionOf) {
    const previous = [...project.runs]
      .reverse()
      .find(
        (run) => run.taskId === task.correctionOf && run.state === "failed",
      );
    const delivery =
      previous && project.deliveries.find((item) => item.runId === previous.id);
    if (previous && delivery) {
      return correctionInputVersionIds(
        project,
        previous.inputVersionIds,
        delivery.outputVersionIds,
      );
    }
  }
  return latestInputVersionIds(project);
}
