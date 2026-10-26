import HawkCatcher from '@hawk.so/javascript';

const token = process.env.NEXT_PUBLIC_HAWK_TOKEN;

if (token !== undefined && token !== '') {
  new HawkCatcher({
    token,
    release: process.env.HAWK_RELEASE,
  });
}
