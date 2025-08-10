using KBVE.SSDB;
using KBVE.SSDB.SupabaseFDW;
using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using Supabase;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;
using Client = Supabase.Client;


namespace KBVE.SSDB.SupabaseFDW
{
    public class UnitySession : IGotrueSessionPersistence<Session>
    {

    }

}