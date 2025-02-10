using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;


public class UIFade : MonoBehaviour
{


    public CanvasGroup canvasGroup;    public float fadeDuration = 1.0f;
    public float waitDuration = 1.0f;  // duration to wait between fade in and fade out
    public bool isLooping = false;     // control whether to loop the fade in and out

    void Start()
    {
        if (canvasGroup == null)
        {
            canvasGroup = GetComponent<CanvasGroup>();
        }
    }

    public void FadeIn()
    {
        StartCoroutine(FadeCanvasGroup(canvasGroup, canvasGroup.alpha, 1, fadeDuration));
    }

    public void FadeOut()
    {
        StartCoroutine(FadeCanvasGroup(canvasGroup, canvasGroup.alpha, 0, fadeDuration));
    }

    public void FadeInOut()
    {
        StartCoroutine(FadeInOutCoroutine());
    }

    public void LoopFadeInOut()
    {
        isLooping = true;
        StartCoroutine(LoopFadeInOutCoroutine());
    }

    public void StopLoopFadeInOut()
    {
        isLooping = false;
        StopCoroutine(LoopFadeInOutCoroutine());
    }

    private IEnumerator LoopFadeInOutCoroutine()
    {
        while (isLooping)
        {
            yield return StartCoroutine(FadeInOutCoroutine());
        }
    }

    private IEnumerator FadeInOutCoroutine()
    {
        yield return StartCoroutine(FadeCanvasGroup(canvasGroup, canvasGroup.alpha, 1, fadeDuration));
        yield return new WaitForSeconds(waitDuration);
        yield return StartCoroutine(FadeCanvasGroup(canvasGroup, canvasGroup.alpha, 0, fadeDuration));
    }

    private IEnumerator FadeCanvasGroup(CanvasGroup cg, float startAlpha, float endAlpha, float duration)
    {
        float timeElapsed = 0;

        while (timeElapsed < duration)
        {
            timeElapsed += Time.deltaTime;
            cg.alpha = Mathf.Lerp(startAlpha, endAlpha, timeElapsed / duration);
            yield return null;
        }

        cg.alpha = endAlpha;
    }
}
