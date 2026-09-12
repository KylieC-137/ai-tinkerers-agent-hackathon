# Build Coach demo

Before presenting, replace the fixture placeholders with real photos, deploy over HTTPS, allow camera and microphone access, and run this sequence with the phone propped up.

1. Start with the wall, hook, both mounting options, and stud finder in frame. The goal is prefilled: “My goal is to put up a hook in the wall but I'm not sure where to drill and how to do it. I'm using these hooks and I have this stud finder.” Tap **Start coaching**.
   - Expected: the coach distinguishes the two possible mounting paths and asks you to check the wall first.
2. Pick up the stud finder and say “what next.”
   - Expected: “Put the stud finder in wood or stud mode first.”
3. Deliberately select metal mode, hold it to the wall, and say “does this look good.”
   - Expected: it catches the wrong mode, tells you to switch to wood/stud mode, and does not advance.
4. Switch to wood mode and say “next.”
   - Expected: “Start a few inches to the side, hold it flat, and move slowly sideways.”
5. Show the finder indicating wood and say “next.”
   - Expected: it identifies the likely stud and asks you to find both edges and estimate the center.
6. Mark the center and say “next.”
   - Expected: it records `wallMaterial = wood_stud` and tells you to use the direct screw-in hook, not the separate drywall mounting piece.
7. Deliberately reach for the drywall mounting piece and say “next.”
   - Expected money moment: it uses the remembered wall fact to correct you and keeps the current step active.
8. Position the direct screw-in hook and say “next.”
   - Expected: “Put the screw point at the stud center, orient the hook as it should sit, and drive the screw.”
9. Tighten and say “next.”
   - Expected: “Keep tightening until it is flush, then stop before overtightening.”
10. Say “done?”
    - Expected: it verifies the frame and summarizes that it found the stud, chose the correct mount, and installed into wood.

Open the **i** panel during steps 6 and 7 so judges can see the persisted fact, current step, last observation, actual routed model, latency, and frame.

“I never had to stop, take a picture, explain what tool I was holding, or tell the AI what step I was on. I just said 'next.'”
