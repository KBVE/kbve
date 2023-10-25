import { Client, Databases, Query, Users, ID } from 'node-appwrite';
import axios from 'axios';
import { getStaticFile } from './utils.js';
import { verify } from 'hcaptcha';

export default async ({ req, res, log, error }) => {
  if (req.method === 'GET') {
    return res.send(getStaticFile('index.html'), 200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
  }

  if (req.method === 'POST') {
    const client = new Client()
      .setEndpoint('https://panel.kbve.com/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const data = JSON.parse(req.body);

    let token = '';

    const email = data.email;
    if (data['h-captcha-response']) {
      token = data['h-captcha-response'];
    }
    else if (data.token) {
      token = data.token;
    }
    else {
      return res.json({ ok: false, message: 'Captcha Token Missing' }, 401);
    }
    const username = data.username;
    const password = data.password;

    let user_id = '';

    const secret = process.env.HCAPTCHA_SECRET;

    const v = await verify(secret, token)
      .then((data) => {
        if (data.success === true) {
          return true;
        } else {
          return false;
        }
      })
      .catch((error) => {
        return false;
      });

    if (!v) {
      return res.json({ ok: false, message: 'Captcha Failed' }, 401);
    }

    const pattern = /^[a-zA-Z0-9]*$/;

    if (!pattern.exec(username)) {
      return res.json(
        { ok: false, message: 'Username is not alpha-numeric' },
        401
      );
    }

    if (password.length < 8) {
      return res.json(
        { ok: false, message: 'Password was too short and/or weak!' },
        401
      );
    }

    const db = new Databases(client);
    const users = new Users(client);

    try {
      const { total } = await db.listDocuments('user', 'profile', [
        Query.equal('username', username),
      ]);

      log(`Total : ${total}`);

      if (total > 0) {
        return res.json({ ok: false, message: 'Username is taken' }, 401);
      }
    } catch (e) {
      error(e);
      return res.json({ ok: false, message: 'Database Error' }, 401);
    }

    //?   Create Account

    try {
      const { $id } = await users.create(
        ID.unique(),
        email,
        null,
        password,
        username
      );
      if (!$id) {
        return res.json({ ok: false, message: 'Account Failed' }, 401);
      } else {
        user_id = $id;
      }
    } catch (e) {
      error(e);
      return res.json(
        { ok: false, message: 'Account Error! Maybe you have an account?' },
        401
      );
    }

    //?   Create Profile

    try {
      const { $id } = await db.createDocument('user', 'profile', ID.unique(), {
        username: username,
        updatedAt: new Date(Date.now()).toISOString(),
        uuid: user_id,
      });

      if (!$id) {
        return res.json(
          { ok: false, message: 'Profile $ID was not found?!' },
          401
        );
      } else {
        return res.json(
          { ok: true, message: `Account Created! Welcome ${username}!` },
          200
        );
      }
    } catch (e) {
      error(e);
      return res.json(
        { ok: false, message: 'Profile Document Creation Error!' },
        401
      );
    }
  }

  return res.json({
    kbve: '/register/',
    v: '1.18',
  });
};
