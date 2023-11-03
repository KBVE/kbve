using System.Collections;
using System.Collections.Generic;
using UnityEngine;
//using UnityEngine.UI;
using UnityEngine.SceneManagement;




public class IntroScene_Script : MonoBehaviour
{

    //*       [VARIABLES]
    public UIFade fadeImageScript;
    //  private Button introButton;  // Changed to private



    // Start is called before the first frame update
    void Start()
    {
        //? DEBUG
        Debug.Log("[Booting . . .]");
        if(fadeImageScript != null)
        {
        fadeImageScript.LoopFadeInOut();
        }


        // introButton = GetComponent<Button>();
        // if(introButton != null)
        // {
        //     introButton.onClick.AddListener(LoadTestScene);  // Add listener to button
        // }
        // else
        // {
        //     Debug.LogWarning("No Button component, introButton, found on this GameObject!");
        // }

    }

    // Update is called once per frame
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.S))
        {
            fadeImageScript.StopLoopFadeInOut();
        }
    }


    public void LoadTestScene()
    {
        Debug.Log("LoadTestScene called");
        SceneManager.LoadScene("Scenes/Test");
    }

}
