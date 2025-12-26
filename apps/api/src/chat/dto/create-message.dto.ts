import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}

