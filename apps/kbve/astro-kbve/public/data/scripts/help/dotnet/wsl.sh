#!/bin/bash
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb 
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb

sudo apt-get update && \
  sudo apt-get install -y dotnet-sdk-7.0