# List all recipes
@list:
    just --list

build:
    npm ci
    # test includes build to dist/
    npm run test

