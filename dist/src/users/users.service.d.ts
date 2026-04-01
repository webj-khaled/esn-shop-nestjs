import { CreateUserRequest } from './dto/create-user.request';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
export declare class UsersService {
    private readonly prismaService;
    private readonly emailService;
    private readonly logger;
    constructor(prismaService: PrismaService, emailService: EmailService);
    createUser(data: CreateUserRequest): Promise<{
        id: number;
        email: string;
    }>;
    findByIdentifier(identifier: string): Promise<{
        id: number;
        email: string;
        password: string;
    } | null>;
}
