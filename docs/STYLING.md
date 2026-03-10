# Styling and theming

This guide explains how to set up and customize styles for the application which uses the U.S. Web Design System (USWDS) as a foundation. The application can integrate with `veda-ui` for core feature components styled with USWDS or use `react-uswds` for standalone UI elements like grid, buttons, inputs, modals, etc.

> **Note**: If you're using the provided template, this setup is already configured. You can skip the initial steps unless you're starting from scratch or modifying the default structure.

## Setup requirements

To use USWDS-based styles:

1. **Install Required Dependencies**

    Make sure `@uswds/uswds` and `sass` are installed:

    ```bash
    npm install @uswds/uswds@^3.8.1 sass
    # or
    yarn add @uswds/uswds@^3.8.1 sass
    ```

2. **Configure SASS**

   Update your `sassOptions` in the `next.config.js` file to include the necessary USWDS paths. This allows SASS to resolve and process the USWDS styles correctly:

   ```js
   module.exports = {
     sassOptions: {
       includePaths: [
         'node_modules/@uswds/uswds',
         'node_modules/@uswds/uswds/dist',
         'node_modules/@uswds/uswds/packages',
       ],
     },
   };
   ```

3. **Import and customize styles**

    Create a custom theme configuration file (e.g., `app/styles/_uswds-theme.scss`) to define your application's tokens such as colors, typography, and asset paths. This file allows you to adapt USWDS to your application's branding and design needs.

    Example `_uswds-theme.scss`:

    ```scss
    @use 'uswds-core' with (
        $theme-image-path: '/img',
        $theme-font-path: '/fonts',
        $theme-show-notifications: false,
        $utilities-use-important: true,
        $theme-font-weight-semibold: '600',
        $theme-type-scale-md: 8,
        $theme-color-primary: 'blue-50',
        $theme-color-secondary: 'gold-30'
    );
    ```

    Import your theme and other USWDS styles into a main SCSS file (e.g., `app/styles/index.scss`) to be used in your application.

    ```scss
    @forward 'uswds-theme';
    @forward 'uswds';

    @use 'uswds-core' as *;
    ```

4. **Include styles in the application**

    Import the SCSS file into the root of your application to apply the styles globally:

    ```tsx
    import './styles/index.scss';
    import '@teamimpact/veda-ui/lib/main.css';
    ```

## Further customizing styles with USWDS

In addition to customizing the theme, you can use USWDS utility classes directly in your components for quick and consistent styling. Below is an example of using USWDS utility classes:

### Example: Adding Margins and Padding

```tsx
<div className="usa-section margin-top-3 padding-2">
  <h1 className="margin-bottom-2">Heading 1</h1>
  <p className="padding-left-1">
    This is an example of using USWDS utility classes for spacing.
  </p>
</div>
```

### Example: Custom stylesheets

If further customization is needed, you can also use custom stylesheets alongside USWDS utility classes. For example:

1. Create a custom stylesheet file (e.g., `custom-styles.scss`).
2. Add your custom styles:

    ```scss
    .custom-heading {
        @include u-padding-x(2);
        max-width: units("desktop");

        @include at-media("desktop") {
          @include u-padding-x(4);
        }
    }
    ```

3. Import the stylesheet into the `styles/index.scss` entry file:

    ```scss
    @forward 'uswds-theme';
    @forward 'uswds';

    @use 'uswds-core' as *;

    @import 'custom-styles';

    ```

4. Use the custom class in your component:

    ```tsx
    <h1 className="custom-heading">Custom styled heading</h1>
    ```

### Notes

- Refer to the [USWDS documentation](https://designsystem.digital.gov/utilities/) for a complete list of available utility classes, mixins and design tokens.
