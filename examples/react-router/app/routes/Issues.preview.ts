import { Inspection } from "@nmnmcc/preview";
import { application } from "@nmnmcc/preview/application";
import { href } from "react-router";

const inspection = Inspection.define({
  scope: "body",
  ignore: [
    '[data-inspection-ignore="true"]',
    '[data-slot="sheet-overlay"]',
    '[data-slot="sidebar"]',
    '[data-preview-region="issues-list"]',
    '[data-inspection-detail-active="true"]',
  ],
  elements: {
    detail: '[data-inspection-detail-active="true"]',
    issueList: '[data-preview-region="issues-list"]',
    proof:
      '[data-inspection-detail-active="true"] [data-preview-region="proof"]',
    selectedIssue: '[data-issue-id="PRV-142"]',
    workspace: '[data-preview-lab="workspace"]',
  },
  checks: ({ detail, issueList, proof, selectedIssue, workspace }) => ({
    "detail-in-viewport": Inspection.inside(detail, Inspection.viewport),
    "detail-visible": Inspection.visible(detail),
    "proof-in-detail": Inspection.inside(proof, detail),
    "proof-unobscured": Inspection.unobscured(proof, {
      minimumRatio: 0.8,
    }),
    "selected-issue-in-list": Inspection.inside(selectedIssue, issueList),
    "selected-issue-min-height": Inspection.minSize(selectedIssue, {
      height: 44,
    }),
    "selected-issue-visible": Inspection.visible(selectedIssue),
    "workspace-content-fits": Inspection.contentFits(workspace),
    "workspace-visible": Inspection.visible(workspace),
  }),
});

export default application({
  inspection,
  location: href("/issues/:issueId", { issueId: "PRV-142" }),
});
