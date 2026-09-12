export const wallHookPlaybook = {
  id: "wall-hook",
  name: "Wall hook",
  summary:
    "Install a white wall hook safely, choosing the mounting method only after checking whether the chosen spot is over a wood stud or hollow drywall.",
  steps: [
    { id: "identify-wall", title: "Identify the wall material at the chosen spot" },
    { id: "set-finder", title: "Set the stud finder to wood/stud mode" },
    { id: "scan-wall", title: "Scan slowly sideways with the finder held flat" },
    { id: "mark-center", title: "Locate the stud edges and center, or confirm hollow drywall" },
    { id: "choose-hardware", title: "Choose hardware for the discovered wall material" },
    { id: "position-hook", title: "Position the hook at the mark" },
    { id: "drive-screw", title: "Drive the screw until flush" },
    { id: "verify", title: "Verify the hook is secure" },
  ],
  hardware: {
    directScrewInHook:
      "The direct screw-in hook is the white hook alone with its own screw. Use it over a wood stud.",
    drywallMountingPiece:
      "The drywall mounting piece is the separate anchor or bracket packaged with the hook. Use it only for hollow drywall.",
  },
  branches: [
    "wallMaterial=wood_stud means use the direct screw-in hook and never the separate drywall mounting piece.",
    "wallMaterial=hollow_drywall means use the separate drywall mounting hook according to its mounting method.",
    "wallMaterial=unknown means do not choose hardware yet; complete the stud-finder check.",
  ],
  factVocabulary: {
    wallMaterial: ["wood_stud", "hollow_drywall", "unknown"],
    studFinderMode: ["wood", "metal", "unknown"],
  },
  commonMistakes: [
    "The stud finder is in metal mode while the user is looking for wood. Correct the mode and do not advance.",
    "The stud finder is moving too fast or is not flat against the wall.",
    "The user reaches for the separate drywall mounting piece after wallMaterial=wood_stud was established. Use memory to correct them and do not advance.",
    "The hook is being installed at a stud edge instead of the marked center.",
    "The screw is being overtightened after the hook is flush.",
  ],
  completionEvidence: [
    "Do not infer a stud from a generic wall. Look for a clear stud-finder indication and then edge/center checking.",
    "A user's word 'next' is a request for inspection, not proof the physical action is complete.",
    "The final verification requires visible evidence that the installed hook is seated and secure, or a clear user confirmation supported by the frame.",
  ],
} as const;

export type Playbook = typeof wallHookPlaybook;
