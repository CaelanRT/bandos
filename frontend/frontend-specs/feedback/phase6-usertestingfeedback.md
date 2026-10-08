BandOS UI/UX Fixes from User Testing
Mobile/Small Screen View
[ ] Replace the current mobile menu button with a standard hamburger icon positioned on the left side of the header.
[ ] Remove the `BandOS` wordmark from the default mobile header.
[ ] When the hamburger menu is opened:
Show `BandOS` at the top-left of the menu panel.
Display the primary navigation items underneath.
Animate the menu in from left to right.
Have the menu overlay approximately 80% of the screen width.
Dim or slightly blur the content behind the open menu to create a modern drawer-style interaction.
[ ] Replace the current mobile account/logout controls with a user icon in the header.
[ ] When the user icon is clicked, show a dropdown menu containing:
`Account`
`Log out`
Login
[ ] Remove the expired-session message from the login screen.
If a session expires, simply redirect the user to the login screen without showing an additional session-expired UI message.
[ ] Remove the divider/separator that appears with the expired-session message.
[ ] Change login form validation behavior:
Do not immediately show validation errors while the user is typing.
Validate the fields when the user submits the form or presses Enter.
Show appropriate messages such as:
`Invalid password`
`Please enter your password`
[ ] Reduce the size of the show-password control and restyle it to be smaller and more polished.
Register
[ ] Remove visible password character-limit text from the registration UI.
[ ] Remove visible email character-limit text from the registration UI.
[ ] Reduce the size of the show-password control and restyle it to be smaller and more polished.
Header
[ ] Remove the standalone logout button from its current position.
[ ] Ensure account-related controls are aligned fully to the far right of the header.
[ ] Add a user/account icon to the header.
[ ] Clicking the user icon should open a dropdown menu containing:
`Account`
`Log out`
[ ] Keep the dropdown and icon styling compact and polished.
Create Band
[ ] Fix the sidebar/navigation state when navigating to the Create Band page.
[ ] Ensure the active-page indicator remains visible.
The orange active-state indicator currently disappears.
[ ] Prevent the left-side navigation from collapsing or visually breaking when Create Band is selected.
Account
[ ] Remove the unusual page-level scrolling behavior on the Account page.
[ ] Keep the header fixed in its normal layout and prevent the main content area from scrolling beneath or past it in the current broken manner.
Datebook
[ ] Simplify the Datebook sidebar so it primarily displays the bands the current user belongs to.
[ ] Explore adding a compact `+` icon at the bottom of the sidebar for creating a new band.
Use the existing warm oxblood accent colour.
[ ] Review the Datebook sidebar UX further before finalizing the exact layout and interaction pattern.
Band View - Schedule
[ ] Make the entire event row visually respond to hover.
[ ] Add a subtle background-colour change or highlight across the full row.
[ ] Ensure the hover state makes it clear that the entire row is clickable, rather than only the event time or name.
Band View - Members
[ ] Remove or significantly reduce the size of the initial `Add User` state button.
[ ] Keep the `Add band member or user` input visible at all times.
[ ] Place the `Add User` button directly to the right of the input.
[ ] Remove the cancel button from this interaction.
[ ] Keep the `Add User` button in the existing oxblood/orange accent styling.
[ ] Reduce unnecessary clicks by making the member-add workflow immediately available.
[ ] Keep the success message shown after a member is added.
[ ] Remove the extra divider/separator line that currently appears with the success message.
Event View - Create Event
[ ] Remove timezone selection from the Create Event UI.
[ ] Do not require users to manually choose a timezone when creating an event.
[ ] Preserve timezone handling in the backend/database where needed.
[ ] Prefer automatically deriving the timezone from the browser/local client environment and sending it with the event data.
[ ] Implement this change in a way that does not break existing backend or database functionality.
> **Dependency / Test Audit Required**
>
> This change may affect existing tests. Audit the test suite as part of the timezone UI removal and update any tests that currently expect manual timezone selection or timezone form controls.
Event View - View Event
[ ] Replace the current `Back to Schedule` button with a simpler back button.
[ ] Position the back button:
Left-aligned.
Between the event title and the main content block containing `Schedule`, `Members`, and `Settings`.
[ ] Update event date formatting to:
Numeric day.
Full month name.
Four-digit year.
Example: `1 October 2026`.
[ ] Remove the standalone `Edit Event` and `Delete Event` buttons from the main page layout.
[ ] Replace them with a cog/settings icon.
[ ] Clicking the cog should open a dropdown menu containing:
`Edit Event`
`Delete Event`
