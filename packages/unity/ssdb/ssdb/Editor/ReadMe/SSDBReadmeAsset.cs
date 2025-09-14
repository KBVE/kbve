using UnityEngine;
using UnityEditor;

namespace KBVE.SSDB.Editor
{
    public static class SSDBReadmeAsset
    {
        [MenuItem("KBVE/Info/Create README Asset")]
        public static void CreateReadmeAsset()
        {
            var asset = ScriptableObject.CreateInstance<SSDBReadme>();

            // Set default content
            asset.title = "SSDB - Server Side Database Bridge";
            asset.sections = new SSDBReadme.Section[]
            {
                new SSDBReadme.Section
                {
                    heading = "Welcome to SSDB",
                    text = "SSDB (Server Side Database Bridge) provides a seamless integration between Unity and server-side databases through IRC, WebSockets, and other protocols.\n\n" +
                           "This package includes:\n" +
                           "• IRC Client Integration\n" +
                           "• Steam User Profiles\n" +
                           "• Observable Collections with R3\n" +
                           "• OneJS Bridge Support\n" +
                           "• VContainer Dependency Injection",
                    expandable = false
                },
                new SSDBReadme.Section
                {
                    heading = "Quick Start",
                    text = "1. Import the SSDB package\n" +
                           "2. Add SSDBLifetimeScope to your scene\n" +
                           "3. Configure your IRC settings\n" +
                           "4. Connect and start chatting!",
                    expandable = true,
                    expanded = false
                },
                new SSDBReadme.Section
                {
                    heading = "IRC Configuration",
                    text = "The IRC system supports:\n" +
                           "• Custom servers and channels\n" +
                           "• SSL/TLS connections\n" +
                           "• Steam ID integration\n" +
                           "• Message history with ObservableList\n" +
                           "• Real-time updates via R3",
                    expandable = true,
                    expanded = false
                },
                new SSDBReadme.Section
                {
                    heading = "Documentation",
                    linkText = "📚 View Full Documentation",
                    url = "https://github.com/kbve/ssdb/wiki"
                },
                new SSDBReadme.Section
                {
                    heading = "Support",
                    text = "Need help? Found a bug?",
                    linkText = "🐛 Report Issues on GitHub",
                    url = "https://github.com/kbve/ssdb/issues"
                },
                new SSDBReadme.Section
                {
                    heading = "License",
                    text = "SSDB is licensed under the MIT License.\n" +
                           "© 2024 KBVE - All rights reserved.",
                    expandable = true,
                    expanded = false
                }
            };

            // Create the asset
            string path = "Assets/SSDB_README.asset";
            AssetDatabase.CreateAsset(asset, path);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            // Select the newly created asset
            Selection.activeObject = asset;
            EditorUtility.FocusProjectWindow();

            Debug.Log($"[SSDB] README asset created at: {path}");
        }
    }
}