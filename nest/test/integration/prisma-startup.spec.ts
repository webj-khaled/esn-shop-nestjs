import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Prisma startup integration', () => {
  let moduleRef: TestingModule | undefined;
  let service: PrismaService;

  beforeEach(async () => {
    process.env.DATABASE_URL ||=
      'postgresql://postgres:postgres@localhost:5432/postgres';

    moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('creates PrismaService without constructor validation errors', () => {
    expect(service).toBeDefined();
  });

  it('invokes $connect on module init', async () => {
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined as never);

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
