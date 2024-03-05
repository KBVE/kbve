# WSL

## Prerequisites

https://learn.microsoft.com/en-us/windows/wsl/install

## Instructions

Here are the step-by-step instructions to set up and run the KBVE repository on WSL Ubuntu:

1. Open your WSL Ubuntu terminal.

2. Install Git by running the following command:
   ```bash
   sudo apt install git
   ```

3. Install Python 3.10 by running the following commands:
   ```bash
   sudo add-apt-repository ppa:deadsnakes/ppa
   sudo apt update
   sudo apt install python3.10
   ```

4. Install Node.js and npm by running the following commands:
   ```bash
   sudo apt update
   sudo apt install nodejs npm
   ```

5. Install pnpm globally by running the following command:
   ```bash
   sudo npm install -g pnpm
   ```

6. Install the .NET 7 SDK by running the following commands:
   ```bash
   wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
   sudo dpkg -i packages-microsoft-prod.deb
   rm packages-microsoft-prod.deb
   sudo apt update
   sudo apt install dotnet-sdk-7.0
   ```

7. Install Rust by running the following command:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   Follow the on-screen instructions to complete the Rust installation.

8. Clone the KBVE repository by running the following command:
   ```bash
   git clone https://github.com/KBVE/kbve.git
   ```

9. Change into the cloned repository directory:
   ```bash
   cd kbve
   ```

10. Install the project dependencies using pnpm:
    ```bash
    pnpm install
    ```

11. To run the code watcher, use the following command:
    ```bash
    ./kbve.sh -nx kbve.com:dev
    ```

12. To create a new branch for a new pull request, use the following command:
    ```bash
    ./kbve.sh -atomic you can type anything here and spaces do not matter
    ```

13. If you don't have Visual Studio Code running, you can open it from the terminal by running the following command while inside the repository:
    ```bash
    code .
    ```

14. Visual Studio Code will automatically suggest plugins to install. Install the recommended plugins and reload the editor if needed.

That's it! You should now have the KBVE repository set up and ready to use on your WSL Ubuntu environment.
