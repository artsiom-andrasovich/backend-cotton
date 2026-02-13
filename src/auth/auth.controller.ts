import { Cookie, Public, UserAgent } from '@app/common/decorators';
import { handleTimeoutAndErrors, validateEmail } from '@app/common/utils';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { lastValueFrom, mergeMap } from 'rxjs';
import { AuthService } from './auth.service';
import { ActivateAccountDto, SignInDto, SignUpDto } from './dto';
import { GoogleGuard } from './guards/google.guard';
import { Tokens } from './interfaces';

const REFRESH_TOKEN = 'refreshtoken';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @Post('sign-up')
  public async signUp(@Body() dto: SignUpDto, @Res() res: Response) {
    await validateEmail(dto.email);
    const user = await this.authService.singUp(dto);
    if (!user)
      if (!user) throw new BadRequestException(`Unable to sign-up a user`);

    return res.status(201).json({ email: user.email, id: user.id });
  }

  @Post('sign-in')
  public async signIn(
    @Body() dto: SignInDto,
    @Res() res: Response,
    @UserAgent() agent: string,
  ) {
    const tokens = await this.authService.signIn(dto, agent, res);
    if (!tokens)
      throw new BadRequestException(
        `Can't sign-in with ${JSON.stringify(dto)}`,
      );

    this.setRefreshTokenToCookies(tokens, res);
  }

  @Post('logout')
  public async logout(
    @Cookie(REFRESH_TOKEN) refreshToken: string,
    @Res() res: Response,
  ) {
    if (!refreshToken) {
      return res.sendStatus(HttpStatus.OK);
    }
    await this.authService.deleteRefreshToken(refreshToken);
    res.cookie(REFRESH_TOKEN, '', {
      httpOnly: true,
      secure: true,
      expires: new Date(),
    });
    return res.sendStatus(HttpStatus.OK);
  }

  @Get('refresh-tokens')
  public async refreshTokens(
    @Cookie(REFRESH_TOKEN) refreshToken: string,
    @Res() res: Response,
    @UserAgent() agent: string,
  ) {
    if (!refreshToken) throw new UnauthorizedException();
    const tokens = await this.authService.refreshTokens(refreshToken, agent);
    if (!tokens) throw new UnauthorizedException();
    this.setRefreshTokenToCookies(tokens, res);
  }

  @Get('activation-code/:email')
  public async getActivationCode(@Param('email') email: string) {
    const data = await this.authService.getActivationCode(email);
    return data;
  }

  @Post('activate-account')
  public async activateAccount(
    @Body() dto: ActivateAccountDto,
    @Res() res: Response,
  ) {
    await this.authService.activateAccount(dto);
    return res.sendStatus(HttpStatus.OK);
  }

  private setRefreshTokenToCookies(tokens: Tokens, res: Response) {
    if (!tokens) {
      throw new UnauthorizedException();
    }
    res.cookie(REFRESH_TOKEN, tokens.refreshToken.token, {
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(tokens.refreshToken.exp),
      secure: this.configService.get('NODE_ENV', 'dev') === 'prod',
      path: '/',
    });
    res.status(HttpStatus.CREATED).json({ accessToken: tokens.accessToken });
  }

  @UseGuards(GoogleGuard)
  @Get('google')
  public async googleAuth() {}

  @UseGuards(GoogleGuard)
  @Get('google/callback')
  public async googleAuthCallback(
    @Req() req: Request,
    @Res() res: Response,
    @UserAgent() agent: string,
  ) {
    const token = req.user['accessToken'];
    if (!token)
      return res.redirect(`${this.configService.get('API_URL')}/auth/google`);

    const { accessToken, refreshToken }: any = await lastValueFrom(
      this.httpService
        .get(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`,
        )
        .pipe(
          mergeMap(({ data: { email, email_verified } }) =>
            this.authService.googleAuth(email, agent, email_verified, req.user),
          ),
          handleTimeoutAndErrors(),
        ),
    );

    if (!accessToken || !refreshToken) throw new ForbiddenException();

    res.cookie(REFRESH_TOKEN, refreshToken.token, {
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(refreshToken.exp),
      secure: true,
      path: '/',
    });

    //TODO:
    res.send(`
      <script>
        window.opener.postMessage({ accessToken: "${accessToken}" }, "${this.configService.get('CLIENT_URL')}");
        window.close();
      </script>
    `);
  }
}
