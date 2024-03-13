"use client";

import {cn} from '../../cn';
import React from "react";

import { Label } from "../components/label";
import { Input } from "../components/input";

import HCaptcha from '@hcaptcha/react-hcaptcha';


import {  hcaptcha_site_key, $registerAtom, $registerMap, RegisterFormType } from "@kbve/postgres";


// const hcaptcha_site_key = '';

import { useEffect, useRef, useState } from "react";

import { action, type WritableStore } from "nanostores";

import { useStore } from "@nanostores/react";

import {
  IconBrandGithub,
  IconBrandGoogle,
  IconBrandOnlyfans,
} from "@tabler/icons-react";

 
export function SupabaseRegister() {

  const _registerAtom  = useStore($registerAtom);
  const _registerMap = useStore($registerMap);
  const captchaRef = useRef<any>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onLoad = () => {
      if(captchaRef.current)
      {
      captchaRef.current?.execute();
      }
  };

  useEffect(() => {
    //console.log(`Store is being called! ${_registerAtom}`);
    //console.log('Current state of registerMap:', _registerMap);
  }, [_registerAtom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    $registerMap.setKey(name as keyof RegisterFormType , value);
  };
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    $registerAtom.set('loading');

    // Additional Post Loading

    if(buttonRef.current) {
      buttonRef.current.disabled = true;
    }

    // Loaded!
    $registerAtom.set('loaded');


    //console.log("Form submitted");
  };

  function handleVerificationSuccess(token: string, ekey: string): any {
    const captchaSuccess = true;
    _registerMap.token = token;
    if (captchaSuccess && buttonRef.current) {
      if(_registerMap.confirmPassword == _registerMap.password)
      {
      buttonRef.current.disabled = false; // Enable the button
      }
    }  
  }

  return (
    <div className="max-w-md w-full mx-auto rounded-none md:rounded-2xl p-4 md:p-8 shadow-input bg-black">
      <h2 className="font-bold text-xl text-neutral-200">
        Welcome to KBVE Register Page
      </h2>
      <p className=" text-sm max-w-sm mt-2 text-cyan-300">
        Login to aceternity if you can because we don&apos;t have a login flow
        yet
      </p>
 
      <form className="my-8" onSubmit={handleSubmit}>
        <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
          <LabelInputContainer>
            <Label htmlFor="firstname">First name</Label>
            <Input id="firstname" placeholder="Tyler" type="text" />
          </LabelInputContainer>
          <LabelInputContainer>
            <Label htmlFor="lastname">Last name</Label>
            <Input id="lastname" placeholder="Durden" type="text" />
          </LabelInputContainer>
        </div>


        <LabelInputContainer className="mb-4">
          <Label htmlFor="username">Username</Label>
          <Input id="username" placeholder="holybyte" type="text" name="username"  value={_registerMap.username || ''}
        onChange={handleInputChange} />
        </LabelInputContainer>

        <LabelInputContainer className="mb-4">
          <Label htmlFor="email">Email Address</Label>
          <Input id="email" placeholder="projectmayhem@fc.com" type="email" name="email" value={_registerMap.email || ''}
        onChange={handleInputChange} />
        </LabelInputContainer>
        <LabelInputContainer className="mb-4">
          <Label htmlFor="password">Password</Label>
          <Input id="password" placeholder="••••••••" type="password" name="password"  value={_registerMap.password || ''}
        onChange={handleInputChange} />
        </LabelInputContainer>
        <LabelInputContainer className="mb-4">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input id="confirmPassword" placeholder="••••••••" type="password" name="confirmPassword"   value={_registerMap.confirmPassword || ''}
        onChange={handleInputChange} />
              {(_registerMap.confirmPassword != _registerMap.password) && <div className="text-red-500">Passwords do not match!</div>}

        </LabelInputContainer>
 

        <HCaptcha
        sitekey={hcaptcha_site_key}
        ref={captchaRef}

        onVerify={(token,ekey) => handleVerificationSuccess(token, ekey)}
        onError={(err) => {
          console.error("HCaptcha Error:", err);
          captchaRef.current.resetCaptcha(); // Reset HCaptcha on error
        }}
        onExpire={() => {
          console.log("HCaptcha Token Expired");
          captchaRef.current.resetCaptcha(); // Reset HCaptcha when token expires
        }}
        onChalExpired={() => {
          console.log("HCaptcha Challenge Expired");
          captchaRef.current.resetCaptcha(); // Optional: Reset here if you want
        }}

          />

        <button
          className="disabled:cursor-not-allowed disabled:opacity-50 bg-gradient-to-br relative group/btn from-black to-zinc-800 block bg-zinc-800 w-full text-white rounded-md h-10 font-medium shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] dark:shadow-[0px_1px_0px_0px_var(--zinc-800)_inset,0px_-1px_0px_0px_var(--zinc-800)_inset]"
          type="submit"
          disabled
          ref={buttonRef}
        >
          Sign up &rarr;
          <BottomGradient />
        </button>
 
        <div className="bg-gradient-to-r from-transparent via-neutral-700 to-transparent my-8 h-[1px] w-full" />

      </form>
    </div>
  );
}
 
const BottomGradient = () => {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-500 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-500 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-10 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
    </>
  );
};
 
const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex flex-col space-y-2 w-full", className)}>
      {children}
    </div>
  );
};


