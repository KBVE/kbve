using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;



public class IntroScene_Script : MonoBehaviour
{

    //*       [VARIABLES]
    public UIFade fadeImageScript;


    // Start is called before the first frame update
    void Start()
    {
        //? DEBUG
        Debug.Log("[Booting . . .]");
        if(fadeImageScript != null)
        {
        fadeImageScript.LoopFadeInOut();
        }
    }

    // Update is called once per frame
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.S))
        {
            fadeImageScript.StopLoopFadeInOut();
        }
    }

}
