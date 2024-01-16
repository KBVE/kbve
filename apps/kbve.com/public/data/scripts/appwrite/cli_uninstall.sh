#!/bin/bash

# if appwrite cli is installed via cli
rm -f /usr/local/bin/appwrite | bash

# if appwrite cli is installed via node
npm uninstall -g appwrite-cli