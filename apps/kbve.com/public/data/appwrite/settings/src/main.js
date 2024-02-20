import { Client, Databases, Query, Users, ID, Account } from 'node-appwrite';
import {readKey } from 'openpgp';

export default async ({ req, res, log, error }) => {

  if (req.method === 'GET') {
    return res.send('Settings v0.0.1');
  }


  if (req.method === 'POST') {

    
    // Check if User JWT is set.
    if (!req.headers['x-appwrite-user-jwt']) {
      return res.json({ ok: false, message: 'Captcha Token Missing' }, 401);
    }

    const client = new Client()
    .setEndpoint('https://panel.kbve.com/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

    const JWTclient = new Client()
    .setEndpoint('https://panel.kbve.com/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setJWT(req.headers['x-appwrite-user-jwt'])

    const JWTaccount = new Account(JWTclient)
    const db = new Databases(client);

    let data = '';
    let uuid = '';
    let user_email = '';
    let pgp = '';
    let profileId = '';
    
    try {
        data = JSON.parse(req.body)
    }
    catch (e) {
        return res.json({ok: false, message: 'Unable to Parse data'}, 401)
    }


    try {
      const { $id, email } = await JWTaccount.get();
        if($id) {
          log(`User ID: ${$id}`)
          uuid = $id;
          user_email = email;
        } else {
          error('Unable to get UUID from JWT after using get')
          return res.json({ok: false, message: 'Unable to get UUID from JWT after using get'}, 401)
         
        }
    } catch (e) {
      error(e)
      return res.json({ok: false, message: 'Unable to get account information from JWT'}, 401)

    }

    try {
        log(`Trying to find profile of: UUID ${uuid}`)
        const { total, documents } = await db.listDocuments('user', 'profile', [
          Query.equal('uuid', uuid),
        ]);
          if(total > 0) {
            log(`Profile ID: ${documents[0].$id}`)
            profileId = documents[0].$id;
          } else {
            error('Unable to get Profile id after listDocuments query')
            return res.json({ok: false, message: 'Unable to get Profile id after listDocuments query'}, 401)
          }
    } catch (e) {
      error(e)
      return res.json({ok: false, message: 'Unable to find profile id'}, 401)
    }



    switch(req.path) {
      
      case '/pgp':
        log('[PGP]')

        pgp = data.pgp;
        
        try {
          log('Checking PGP Key')
          const publicKey = await readKey({ armoredKey: pgp})
        } catch (e) {
          error(e.message)
          return res.json({ok: false, message: `Unable to read PGP key ${e.message}`}, 401)
        }

        try {
          
         const { $updatedAt	} = await db.updateDocument('user', 'profile', profileId, {
                pgp: pgp
         })
        } catch (e) {
          error(e)
          return res.json({ok: false, message: `Unable to set PGP key ${e.message}`}, 401)
        }
        
        return res.json({ ok: true, message: 'PGP was updated'})

      default:
        return res.json({
          ok: false,
          message: 'Path was missing'
        }, 401);
    }
  }
};
