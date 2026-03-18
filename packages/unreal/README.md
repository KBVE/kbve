Unreal Engine Code Plugins
The following guidelines apply to Code Plugins:

Code Plugins must contain at least one code module.

Code Plugins can contain any content that you need in order for the plugin to function appropriately.

Make sure that your Code Plugins offer base functionality so that the product has inherent value for buyers. You can include additional functionality through a license or subscription model if your product meets the following requirements:

The Fab minimum content standards.

The Fab quality standards.

Includes enough functionality to stand on its own.

All Code Plugin products must contain the following:

.uplugin file

Source directory

Content directory

Config directory

The directory structure must be as follows:

MyPlugin

Config

Content

Resources

Source

MyModule

Private

Public

MyModule.build.cs

ThirdParty

MyPlugin.uplugin

Other guidelines:

You must compress the project into a .zip file before you upload it to Fab.
