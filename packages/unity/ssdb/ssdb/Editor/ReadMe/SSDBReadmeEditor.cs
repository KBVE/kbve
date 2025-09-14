using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using System;
using System.IO;
using System.Reflection;
using KBVE.MMExtensions.Editor;

namespace KBVE.SSDB.Editor
{
    [CustomEditor(typeof(SSDBReadme))]
    [InitializeOnLoad]
    public class SSDBReadmeEditor : UnityEditor.Editor
    {
        static string s_ShowedReadmeSessionStateName = "SSDBReadmeEditor.showedReadme";
        const float k_Space = 16f;
        const float k_SectionSpace = 8f;

        static SSDBReadmeEditor()
        {
            EditorApplication.delayCall += SelectReadmeAutomatically;
        }

        static void SelectReadmeAutomatically()
        {
            if (!SessionState.GetBool(s_ShowedReadmeSessionStateName, false))
            {
                var readme = SelectReadme();
                SessionState.SetBool(s_ShowedReadmeSessionStateName, true);

                if (readme)
                {
                    Selection.activeObject = readme;
                    Debug.Log("[SSDB] Welcome! README loaded.");
                }
            }
        }

        static SSDBReadme SelectReadme()
        {
            var ids = AssetDatabase.FindAssets("t:SSDBReadme");
            if (ids.Length >= 1)
            {
                var readmeObject = AssetDatabase.LoadMainAssetAtPath(AssetDatabase.GUIDToAssetPath(ids[0]));
                return (SSDBReadme)readmeObject;
            }
            else
            {
                Debug.Log("[SSDB] No README found. Create one via Assets > Create > SSDB > Readme");
                return null;
            }
        }

        [MenuItem("KBVE/Info/Show README")]
        public static void ShowReadme()
        {
            var readme = SelectReadme();
            if (readme)
            {
                Selection.activeObject = readme;
            }
        }

        [MenuItem("KBVE/Documentation/Online Docs")]
        public static void OpenOnlineDocs()
        {
            Application.OpenURL("https://github.com/kbve/ssdb/wiki");
        }

        [MenuItem("KBVE/Documentation/API Reference")]
        public static void OpenAPIReference()
        {
            Application.OpenURL("https://github.com/kbve/ssdb/wiki/API");
        }

        protected override void OnHeaderGUI()
        {
            var readme = (SSDBReadme)target;
            Init();

            var iconWidth = Mathf.Min(EditorGUIUtility.currentViewWidth / 3f - 20f, 128f);

            GUILayout.BeginHorizontal("In BigTitle");
            {
                if (readme.icon != null)
                {
                    GUILayout.Space(k_Space);
                    GUILayout.Label(readme.icon, GUILayout.Width(iconWidth), GUILayout.Height(iconWidth));
                }
                GUILayout.Space(k_Space);
                GUILayout.BeginVertical();
                {
                    GUILayout.FlexibleSpace();
                    GUILayout.Label(readme.title, TitleStyle);
                    GUILayout.FlexibleSpace();
                }
                GUILayout.EndVertical();
                GUILayout.FlexibleSpace();
            }
            GUILayout.EndHorizontal();
        }

        public override void OnInspectorGUI()
        {
            var readme = (SSDBReadme)target;
            Init();

            // GitHub Issues Section (from MMExtensions)
            EditorGithubIssues.DrawUnityIssues();

            GUILayout.Space(k_Space);
            EditorGUILayout.LabelField("", GUI.skin.horizontalSlider);
            GUILayout.Space(k_Space);

            // Quick Actions Bar
            EditorGUILayout.BeginHorizontal();
            {
                if (GUILayout.Button("📚 Documentation", ButtonStyle))
                {
                    OpenOnlineDocs();
                }
                if (GUILayout.Button("🔧 API Reference", ButtonStyle))
                {
                    OpenAPIReference();
                }
                if (GUILayout.Button("🔄 Refresh", ButtonStyle))
                {
                    AssetDatabase.Refresh();
                }
            }
            EditorGUILayout.EndHorizontal();

            GUILayout.Space(k_Space);

            // Render sections
            foreach (var section in readme.sections)
            {
                if (!string.IsNullOrEmpty(section.heading))
                {
                    if (section.expandable)
                    {
                        section.expanded = EditorGUILayout.Foldout(section.expanded, section.heading, true, FoldoutStyle);

                        if (!section.expanded)
                        {
                            GUILayout.Space(k_SectionSpace);
                            continue;
                        }
                    }
                    else
                    {
                        GUILayout.Label(section.heading, HeadingStyle);
                    }
                }

                if (!string.IsNullOrEmpty(section.text))
                {
                    if (section.expandable)
                    {
                        EditorGUI.indentLevel++;
                    }

                    GUILayout.Label(section.text, BodyStyle);

                    if (section.expandable)
                    {
                        EditorGUI.indentLevel--;
                    }
                }

                if (!string.IsNullOrEmpty(section.linkText))
                {
                    if (LinkLabel(new GUIContent(section.linkText)))
                    {
                        Application.OpenURL(section.url);
                    }
                }

                GUILayout.Space(k_Space);
            }

            // Status Information
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("", GUI.skin.horizontalSlider);

            EditorGUILayout.BeginHorizontal();
            {
                GUILayout.Label("SSDB Version: 1.0.0", FooterStyle);
                GUILayout.FlexibleSpace();
                GUILayout.Label("© 2024 KBVE", FooterStyle);
            }
            EditorGUILayout.EndHorizontal();
        }

        #region Styles

        bool m_Initialized;

        GUIStyle LinkStyle { get { return m_LinkStyle; } }
        [SerializeField] GUIStyle m_LinkStyle;

        GUIStyle TitleStyle { get { return m_TitleStyle; } }
        [SerializeField] GUIStyle m_TitleStyle;

        GUIStyle HeadingStyle { get { return m_HeadingStyle; } }
        [SerializeField] GUIStyle m_HeadingStyle;

        GUIStyle BodyStyle { get { return m_BodyStyle; } }
        [SerializeField] GUIStyle m_BodyStyle;

        GUIStyle ButtonStyle { get { return m_ButtonStyle; } }
        [SerializeField] GUIStyle m_ButtonStyle;

        GUIStyle FoldoutStyle { get { return m_FoldoutStyle; } }
        [SerializeField] GUIStyle m_FoldoutStyle;

        GUIStyle FooterStyle { get { return m_FooterStyle; } }
        [SerializeField] GUIStyle m_FooterStyle;

        void Init()
        {
            if (m_Initialized)
                return;

            m_BodyStyle = new GUIStyle(EditorStyles.label);
            m_BodyStyle.wordWrap = true;
            m_BodyStyle.fontSize = 14;
            m_BodyStyle.richText = true;

            m_TitleStyle = new GUIStyle(m_BodyStyle);
            m_TitleStyle.fontSize = 26;
            m_TitleStyle.fontStyle = FontStyle.Bold;

            m_HeadingStyle = new GUIStyle(m_BodyStyle);
            m_HeadingStyle.fontStyle = FontStyle.Bold;
            m_HeadingStyle.fontSize = 18;

            m_LinkStyle = new GUIStyle(m_BodyStyle);
            m_LinkStyle.wordWrap = false;
            m_LinkStyle.normal.textColor = new Color(0x00 / 255f, 0x78 / 255f, 0xDA / 255f, 1f);
            m_LinkStyle.stretchWidth = false;

            m_ButtonStyle = new GUIStyle(GUI.skin.button);
            m_ButtonStyle.fontSize = 12;
            m_ButtonStyle.padding = new RectOffset(10, 10, 4, 4);

            m_FoldoutStyle = new GUIStyle(EditorStyles.foldout);
            m_FoldoutStyle.fontStyle = FontStyle.Bold;
            m_FoldoutStyle.fontSize = 16;

            m_FooterStyle = new GUIStyle(EditorStyles.miniLabel);
            m_FooterStyle.fontSize = 10;
            m_FooterStyle.normal.textColor = Color.gray;

            m_Initialized = true;
        }

        bool LinkLabel(GUIContent label, params GUILayoutOption[] options)
        {
            var position = GUILayoutUtility.GetRect(label, LinkStyle, options);

            Handles.BeginGUI();
            Handles.color = LinkStyle.normal.textColor;
            Handles.DrawLine(new Vector3(position.xMin, position.yMax), new Vector3(position.xMax, position.yMax));
            Handles.color = Color.white;
            Handles.EndGUI();

            EditorGUIUtility.AddCursorRect(position, MouseCursor.Link);

            return GUI.Button(position, label, LinkStyle);
        }

        #endregion
    }
}