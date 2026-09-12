# Demo fixtures

These JPEGs are labeled placeholders so the API test path works before real photos are available. Replace them in place with phone photos matching each label:

- `01-tools.jpg`: wall, white hook, separate drywall piece, and stud finder
- `02-metal-mode.jpg`: finder visibly set to metal mode against the wall
- `03-wood-detected.jpg`: finder in wood/stud mode indicating a stud
- `04-wrong-anchor.jpg`: separate drywall mounting piece held after the stud was found
- `wood-state.json`: saved state immediately before the wrong-anchor money moment

The application has no fixture-specific logic. They are only inputs for manual prompt tuning and `scripts/test-step.ts`.
