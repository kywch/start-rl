# Card Table: for Sharing Awesome Projects

You found 30 awesome projects and want to share them with your friends? Card Table lets you drag these around, organize and annotate, and publish on GitHub.

This app is built with [Claude Artifact Runner](https://github.com/claudio-silva/claude-artifact-runner), with much help from [Claude](https://claude.ai/).

## Getting started
The following assumes that you develop locally and deploy to GitHub Pages.

0. Before you begin, ensure you have the following installed on your local dev environment:
   ```
   Node.js (version 14 or later)
   npm (usually comes with Node.js)
   ```

1. Fork (or `Use this template`) this repo, and git clone your fork:
   ```
   git clone https://github.com/<YOUR_GITHUB_USERNAME>/card-table.git
   cd card-table
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and visit `http://localhost:5173` to see the default app running.

5. Add your cards to the `public/cards.yaml` file, and press `Reload cards`. Organize your cards as you see fit.

6. You can change title, add text, and delete cards. But, these changes are <b>NOT saved and will be lost when you refresh the page</b>.

7. To capture the current table, press the `Save table` to get the table file and replace `public/table_data.json`.

8. Once you're satified, deploy the app to GitHub Pages:
   ```
   npm run deploy
   ```

If you encounter any issues, first check the detailed instructions in the [Claude Artifact Runner](https://github.com/claudio-silva/claude-artifact-runner) repo.
