import {Schema, type} from '@colyseus/schema';

export type TPlayerOptions = Pick<Player, 'sessionId' | 'userId' | 'name' | 'avatarUri' | 'talking' | 'x' | 'y' | 'z'>;

export class Player extends Schema {
  @type('string')
  public sessionId: string;

  @type('string')
  public userId: string;

  @type('string')
  public avatarUri: string;

  @type('string')
  public name: string;

  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  @type('boolean')
  public talking: boolean = false;

  @type('number')
  public x: number;

  @type('number')
  public y: number;

  @type('number')
  public z: number;

  // Init
  constructor({name, userId, avatarUri, sessionId}: TPlayerOptions) {
    super();
    this.userId = userId;
    this.avatarUri = avatarUri;
    this.name = name;
    this.sessionId = sessionId;
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}