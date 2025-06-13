## Relevant Files
- `app/src/main/java/com/example/fourkeykeyboard/ui/KeyboardView.kt` - Main keyboard view displaying the four large keys and handling UI rendering.
- `app/src/main/java/com/example/fourkeykeyboard/input/GestureDetector.kt` - Contains gesture detection logic for click, slide, and direction.
- `app/src/main/java/com/example/fourkeykeyboard/input/CharacterMapper.kt` - Maps detected gestures to the appropriate characters depending on current mode.
- `app/src/main/java/com/example/fourkeykeyboard/input/ModeManager.kt` - Handles mode switching between lowercase, uppercase, and numeric input.
- `app/src/main/java/com/example/fourkeykeyboard/tutorial/TutorialActivity.kt` - Displays the onboarding tutorial to help users learn gestures.
- `app/src/main/java/com/example/fourkeykeyboard/KeyboardService.kt` - Manages Android integration as an Input Method Service (acts as the actual keyboard).
- `app/src/main/res/layout/activity_tutorial.xml` - Layout file for the tutorial screen.
- `app/src/test/java/com/example/fourkeykeyboard/input/GestureDetectorTest.kt` - Unit tests for gesture detection.
- `app/src/test/java/com/example/fourkeykeyboard/input/CharacterMapperTest.kt` - Unit tests for character mapping.
- `app/src/test/java/com/example/fourkeykeyboard/input/ModeManagerTest.kt` - Unit tests for mode switching logic.
- `app/src/androidTest/java/com/example/fourkeykeyboard/ui/KeyboardViewTest.kt` - UI/instrumentation tests for keyboard interactions.

### Notes
- Unit tests should typically be placed alongside the code files they are testing (e.g., `GestureDetector.kt` and `GestureDetectorTest.kt` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration. (For Android, replace with `./gradlew test` for unit tests or `./gradlew connectedAndroidTest` for instrumentation tests.)

## Tasks

- [ ] 1.0 Implement Four-Key Layout and Gesture Recognition
  - [ ] 1.1 Design and create the four large key UI elements in `KeyboardView.kt`.
  - [ ] 1.2 Implement touch handling and gesture detection logic in `GestureDetector.kt` for all nine directions per key.
  - [ ] 1.3 Integrate gesture detection with the keyboard UI to show visual feedback.
  - [ ] 1.4 Write unit tests for gesture detection logic in `GestureDetectorTest.kt`.

- [ ] 2.0 Map Gestures to Characters and Input Events
  - [ ] 2.1 Define and implement character layout/mappings as per the provided sketch in `CharacterMapper.kt`.
  - [ ] 2.2 Implement logic to handle input events from detected gestures and insert correct characters.
  - [ ] 2.3 Ensure mappings update when switching modes (lowercase, uppercase, numeric).
  - [ ] 2.4 Write unit tests for character mapping in `CharacterMapperTest.kt`.

- [ ] 3.0 Implement Mode Switching (Lowercase, Uppercase, Numeric)
  - [ ] 3.1 Add UI button(s) for toggling between input modes in `KeyboardView.kt`.
  - [ ] 3.2 Implement mode management logic in `ModeManager.kt` to handle mode changes.
  - [ ] 3.3 Ensure all gesture mappings and keyboard UI update dynamically upon mode switch.
  - [ ] 3.4 Write unit tests for mode management in `ModeManagerTest.kt`.

- [ ] 4.0 Create User Tutorial/Guide for Gestures
  - [ ] 4.1 Design the tutorial screen UI in `activity_tutorial.xml` and activity logic in `TutorialActivity.kt`.
  - [ ] 4.2 Implement step-by-step onboarding to demonstrate each gesture and its mapped character.
  - [ ] 4.3 Provide users with a way to replay or exit the tutorial from the main keyboard app.
  - [ ] 4.4 Optionally, add interactive practice for users to try gestures.

- [ ] 5.0 Android Integration and Configuration (Default Keyboard Support)
  - [ ] 5.1 Implement `KeyboardService.kt` as an Android Input Method Service.
  - [ ] 5.2 Register the keyboard in `AndroidManifest.xml` for input method support.
  - [ ] 5.3 Ensure seamless integration so that users can set this keyboard as default via system settings.
  - [ ] 5.4 Test keyboard on various Android devices for compatibility and UI scaling.
  - [ ] 5.5 Write UI/instrumentation tests for overall end-to-end keyboard behavior in `KeyboardViewTest.kt`.