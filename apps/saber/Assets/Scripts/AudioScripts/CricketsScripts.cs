using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class CricketsScripts : MonoBehaviour
{
  AudioSource cricketsSource;
  [SerializeField] AudioClip[] crickets;
    // Start is called before the first frame update
    void Start()
    {
        cricketsSource = GetComponent<AudioSource>();
    }

    // Update is called once per frame
    void Update()
    {
        if(!cricketsSource.isPlaying)
    {
      cricketsSource.PlayOneShot(crickets[Random.Range(0, crickets.Length)]);
    }
    }
}
