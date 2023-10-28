import { Module, Global } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DBModule } from '../db/db.module';
import { UserModule } from './user/user.module';

@Module({
	imports: [DBModule,	UserModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
