# Instructions for ESIP 2025 Workshop

You can edit all the files directly in Github. If you would like to use your local machine, we can help you clone this repo and get that setup. That process is also described in the slides. The workflow below is the default workflow to edit files here within Github.

1. Navigate to the file you want to edit. To start, we can go to app > content > stories > template-story.mdx
2. Click the pen icon in the top right corner of the file
3. In the edit mode, you will be able to edit the MDX content. Everything for a story is driven by MDX. This template will be in the structure that you need, so feel free to edit anything in the body.
4. Once you have made an edit, click the green Commit changes button in the top right.
5. On the resulting modal, click to commit the changes. This will create a fork of the repo under your personal account.
6. On the resulting screen, you should see a button to create a pull request. Click that now to generate a preview of the changes you have made. For the pull request, we ask that you name it "esip2025_your-name"
7. Once your preview is approved (by session facilitators) then you will see a preview link on your pull request that you can open to see the Dashboard with your changes.
8. In order to continue editing content, open your branch in a new tab by right clicking on the branch name in the pull request and selecting to open in a new tab. Now you will be able to make changes and then see those changes built in your pull request on the original tab.

Now it's time to write a story story! We have two options available:
- **Crafting your own story with some of the available datasets.** Navigate to app -> content -> stories -> select ```template-story.mdx``` and open it in GitHub editor (the pencil symbol). Try writing in your own story and swapping out the datasets which are preloaded. There are two widgets to test - first is a comparison map slider between two dates of the same dataset. Another is a scrollytelling widget that allows you to jump around on a map and show different datasets.
- **Contribute to an existing agriculture story by adding a mapping widget.** Navigate to app -> content -> stories -> select ```sat-data-agriculture.mdx```. This is a pre-made story that does not show any interactive maps highlighting the GEOGLAM dataset. Try adding any type of widget (getting inspiration from the ```template-story.mdx``` or any other posted story). This will require you to get metadata information for the GEOGLAM dataset which can be found under app -> content -> datasets -> ```geoglam.mdx```

Make a note of the ```id``` and ```layerid``` of the dataset and variable you're interested in telling a story with

## Getting Started

To set up and run this project locally, refer to the [Development guide](./docs/DEVELOPMENT.md) or ask a facilitator.

## Documentation

Documentation for this project can be found in the [`docs`](./docs) directory. Below is a quick summary of available resources:

1. [How to Run / Development](./docs/DEVELOPMENT.md)
2. [Storytelling Widgets](https://github.com/NASA-IMPACT/veda-ui/blob/main/docs/content/MDX_BLOCKS.md)
3. [Story MDX Metadata Configuration](https://github.com/NASA-IMPACT/veda-ui/blob/main/docs/content/CONTENT.md#stories)

## License

[MIT](LICENSE)
