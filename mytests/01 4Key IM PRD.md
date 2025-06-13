# PRD: Four-Key Input Method Android Application

## Introduction/Overview

This Android application introduces an innovative input method using four keys that detect both clicks and slides. The design addresses the problem of small keys in traditional mobile keyboards, aiming to reduce misspelling and improve typing speed and accuracy.

## Goals

1. Provide a user-friendly typing experience with larger keys.
2. Enable faster and more accurate typing once users learn the gestures.
3. Offer seamless switching between lowercase, uppercase, and numerical input.

## User Stories

1. As a user, I want to type with larger keys to reduce errors caused by small key sizes.
2. As a user, I want to quickly switch between letters, uppercase, and numbers for versatile typing.
3. As a user, I want to learn simple gestures to type efficiently on my device.

## Functional Requirements

1. **Key Actions:**
    - The system must detect nine gestures for each key: Up-Left, Up, Up-Right, Left, Click, Right, Down-Left, Down, Down-Right.
    - Each gesture should map to a specific character.

2. **Character Mapping:**
    - Implement the character layout as per the provided sketch.
    - Allow additional keys for switching between uppercase and numerical modes.

3. **Mode Switching:**
    - Implement a button to toggle between lowercase, uppercase, and numeric input.

4. **Ease of Use:**
    - Provide a tutorial or guide to help new users learn the gestures.

## Non-Goals (Out of Scope)

- The application will not include advanced predictive text or autocorrect functionalities at launch.

## Design Considerations

- Follow the basic sketch provided for the layout of characters.
- Ensure the interface is clean and easy to navigate, focusing on large, easily accessible keys.

## Technical Considerations

- The application should be compatible with Android devices.
- Ensure smooth integration so it can be set as the default keyboard input method.

## Success Metrics

- User adoption rate of the keyboard.
- Improvement in typing speed and accuracy through user feedback and testing.

## Open Questions

- What specific user testing methods would provide the best insights?
- Are there any specific accessibility features that need integration?
