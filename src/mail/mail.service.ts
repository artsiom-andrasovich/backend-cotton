import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
type SendMail = {
  to: string;
  subject?: string;
  template: 'activation' | 'reset-password';
  context: unknown;
};
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private mailerService: MailerService) {}

  async sendMail(data: SendMail) {
    const { context, subject, template, to } = data;
    this.logger.log(
      `Sending email to: ${to} with subject: ${subject}, template: ${template}`,
    );
    return this.mailerService
      .sendMail({
        to,
        subject,
        template,
        context,
      })
      .then((res) => {
        this.logger.log(`Email sent successfully to: ${to}`);
        return res;
      })
      .catch((err) => {
        this.logger.error(
          `Failed to send email to: ${to}. Error: ${err.message}`,
        );
        throw err;
      });
  }

  async sendActivationMail(to: string, code: number) {
    this.logger.log(`Preparing activation email for: ${to}`);
    return this.sendMail({
      to,
      subject: 'Activate your account',
      template: 'activation',
      context: { code },
    });
  }

  async sendResetPasswordCodeEmail(to, code) {
    this.logger.log(`Preparing reset password email for: ${to}`);
    return this.sendMail({
      to,
      subject: 'Reset your password',
      template: 'reset-password',
      context: { code },
    });
  }
}
