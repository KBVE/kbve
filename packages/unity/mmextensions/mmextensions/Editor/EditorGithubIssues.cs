using System;
using System.Collections.Generic;
using System.Net;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace KBVE.MMExtensions.Editor
{
    public static class EditorGithubIssues
    {
        private const int IssuesPerPage = 3;
        private static readonly Dictionary<int, List<GithubIssue>> IssueCache = new();
        private static readonly Dictionary<string, Texture2D> AvatarCache = new();

        private static readonly Dictionary<int, bool> IsLoading = new();
        private static readonly Dictionary<int, int> PageIndex = new();

        private static int _selectedLevel = 6;

        public static void DrawUnityIssues()
        {
            GUILayout.BeginVertical("box");
            GUILayout.Label("📂 Open Unity Issues by Priority", EditorStyles.boldLabel);
            DrawAlertTabs();

            if (!IssueCache.ContainsKey(_selectedLevel))
            {
                if (!IsLoading.ContainsKey(_selectedLevel) || !IsLoading[_selectedLevel])
                    FetchIssuesAsync(_selectedLevel);

                GUILayout.Label("⏳ Loading issues...");
            }
            else
            {
                var issues = IssueCache[_selectedLevel];
                int page = PageIndex.GetValueOrDefault(_selectedLevel, 0);
                int totalPages = Mathf.CeilToInt(issues.Count / (float)IssuesPerPage);

                for (int i = page * IssuesPerPage; i < Mathf.Min(issues.Count, (page + 1) * IssuesPerPage); i++)
                {
                    DrawIssueCard(issues[i]);
                    GUILayout.Space(8);
                }

                DrawPagination(page, totalPages);
            }

            GUILayout.EndVertical();
        }

        private static void DrawAlertTabs()
        {
            GUILayout.BeginHorizontal();
            for (int level = 6; level >= 0; level--)
            {
                GUI.backgroundColor = (_selectedLevel == level) ? Color.cyan : Color.gray;
                if (GUILayout.Button($"L{level}", GUILayout.Width(32)))
                {
                    _selectedLevel = level;
                    if (!IssueCache.ContainsKey(level))
                        FetchIssuesAsync(level);
                }
            }
            GUI.backgroundColor = Color.white;
            GUILayout.EndHorizontal();
        }

        private static void DrawPagination(int currentPage, int totalPages)
        {
            GUILayout.BeginHorizontal();
            GUI.enabled = currentPage > 0;
            if (GUILayout.Button("Prev", GUILayout.Width(50)))
                PageIndex[_selectedLevel] = currentPage - 1;

            GUILayout.FlexibleSpace();
            GUILayout.Label($"Page {currentPage + 1} / {Mathf.Max(totalPages, 1)}", EditorStyles.miniBoldLabel);
            GUILayout.FlexibleSpace();

            GUI.enabled = currentPage < totalPages - 1;
            if (GUILayout.Button("Next", GUILayout.Width(50)))
                PageIndex[_selectedLevel] = currentPage + 1;

            GUI.enabled = true;
            GUILayout.EndHorizontal();
        }

        private static void DrawIssueCard(GithubIssue issue)
        {
            GUILayout.BeginHorizontal();

            // Avatar
            Texture2D avatar = GetUserAvatar(issue.user.login, issue.user.avatar_url);
            if (avatar != null)
            {
                GUILayout.Label(avatar, GUILayout.Width(32), GUILayout.Height(32));
            }
            else
            {
                GUILayout.Space(34);
            }

            // Issue content
            GUILayout.BeginVertical();
            GUILayout.Label($"#{issue.number} — {issue.title}", EditorStyles.boldLabel);

            DateTime created = DateTime.Parse(issue.created_at).ToLocalTime();
            GUILayout.Label($"Opened by @{issue.user.login} on {created:MMM dd, yyyy}", EditorStyles.miniLabel);

            if (GUILayout.Button("Open in GitHub", GUILayout.Width(120)))
            {
                Application.OpenURL(issue.html_url);
            }

            GUILayout.EndVertical();
            GUILayout.EndHorizontal();
        }

        private static void FetchIssuesAsync(int level)
        {
            IsLoading[level] = true;
            string url = $"https://api.github.com/repos/KBVE/kbve/issues?state=open&labels=unity,{level}";

            WebClient client = new();
            client.Headers.Add("User-Agent", "UnityEditor");
            client.DownloadStringCompleted += (s, e) =>
            {
                IsLoading[level] = false;
                if (e.Error != null)
                {
                    Debug.LogWarning($"[GitHub] Error fetching issues (level {level}): {e.Error.Message}");
                    return;
                }

                try
                {
                    var issues = JsonHelper.FromJsonArray<GithubIssue>(e.Result);
                    IssueCache[level] = issues;
                    PageIndex[level] = 0;
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[GitHub] JSON parse error: {ex.Message}");
                }
            };

            client.DownloadStringAsync(new Uri(url));
        }

        private static Texture2D GetUserAvatar(string username, string url)
        {
            if (AvatarCache.TryGetValue(username, out var cached))
                return cached;

            // Start async download and return null until it completes
            UnityWebRequest request = UnityWebRequestTexture.GetTexture(url);
            var operation = request.SendWebRequest();
            operation.completed += _ =>
            {
                if (!request.isNetworkError && !request.isHttpError)
                {
                    Texture2D avatar = DownloadHandlerTexture.GetContent(request);
                    AvatarCache[username] = avatar;
                }
            };

            return null;
        }

        [Serializable]
        private class GithubIssue
        {
            public int number;
            public string title;
            public string html_url;
            public string created_at;
            public GithubUser user;
        }

        [Serializable]
        private class GithubUser
        {
            public string login;
            public string avatar_url;
        }

        public static class JsonHelper
        {
            public static List<T> FromJsonArray<T>(string json)
            {
                string wrapped = $"{{ \"array\": {json} }}";
                return new List<T>(JsonUtility.FromJson<Wrapper<T>>(wrapped).array);
            }

            [Serializable]
            private class Wrapper<T>
            {
                public T[] array;
            }
        }
    }
}
