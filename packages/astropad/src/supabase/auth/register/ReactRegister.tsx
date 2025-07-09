/** @jsxImportSource react */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useStore } from '@nanostores/react';
import { useForm } from 'react-hook-form';