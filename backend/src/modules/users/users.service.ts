import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  create(email: string, passwordHash: string): Promise<UserEntity> {
    return this.users.save(this.users.create({ email: email.trim().toLowerCase(), passwordHash, emailVerifiedAt: null }));
  }

  async touchLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }
}
