using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class BirdsSceneLoop : MonoBehaviour
{
  [SerializeField] AudioClip[] birdLoops;
  AudioSource birdSource;
    // Start is called before the first frame update
    void Start()
    {
        birdSource = GetComponent<AudioSource>();
    }

    // Update is called once per frame
    void Update()
    {
        
        if(!birdSource.isPlaying)
        {
        birdSource.PlayOneShot(birdLoops[Random.Range(0, birdLoops.Length)]);
        }
    }
}
