using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

public class LoadMainMenu : MonoBehaviour
{
  /// <summary>
  ///  The number of scenes
  /// </summary>
  [SerializeField] int LevelNumber = 1;

  private void Start()
    {
        SceneManager.LoadScene(LevelNumber);
    }
   
}
