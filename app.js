/* eslint-disable no-unused-vars */
const smpp = require('smpp');
const strftime = require('strftime');
const logger = require('pino')();

const statuses = {
  delivered: { stat: 'DELIVRD', err: '0' },
  provider_failure: { stat: 'UNKNOWN', err: '47' },
  undelivered: { stat: 'UNDELIV', err: '35' },
  phone_not_exists: { stat: 'REJECTD', err: '53' },
  billing_error: { stat: 'REJECTD', err: '56' },
  spam_rejected: { stat: 'REJECTD', err: '57' },
  flooding: { stat: 'REJECTD', err: '58' },
  blacklisted: { stat: 'REJECTD', err: '60' },
  retrying: { stat: 'ACCEPTD', err: '68' },
  canceled: { stat: 'REJECTD', err: '82' },
  expired: { stat: 'EXPIRED', err: '88' },
  deleted_by_sender: { stat: 'DELETED', err: '95' },
  deleted_by_admin: { stat: 'DELETED', err: '96' },
  invalid_format: { stat: 'REJECTD', err: '778' },
};

const settings = {
  port: process.env.PORT || 2775, // smpp server port
  ddmin: process.env.DDMIN || 0, // min delay in seconds
  ddmax: process.env.DDMAX || 0, // max delay in seconds
  status: process.env.STATUS || 'delivered', // refer to statuses object
  system_id: process.env.ESME_USERNAME || 'username', // eseme username
  password: process.env.PASSWORD || 'password', // esme password
};

// Settings validation
if (settings.ddmax < settings.ddmin) {
  logger.error('DDMAX can\'t be lower than DDMIN');
  process.exit();
}

function getDeliveryReceipt(msgID, status, receivedAt, doneAt, message) {
  const receipt = {
    id: msgID,
    sub: '001', // not used in fact
    dlvrd: 1, // not used in fact
    'submit date': strftime('%y%m%d%H%M', receivedAt),
    'done date': strftime('%y%m%d%H%M', doneAt),
    stat: status.stat,
    err: status.err,
    text: message.substring(0, 20), // first 20 symbols of the message
  };
  const deliveryReceipt = [];

  Object.keys(receipt).forEach((key) => {
    deliveryReceipt.push(`${key}:${receipt[key]}`);
  });

  return deliveryReceipt.join(' ');
}

function getDeliveryDelay() {
  if (settings.ddmin === settings.ddmax) {
    return settings.ddmin;
  }

  return Math.random() * (settings.ddmax - settings.ddmin) + settings.ddmin;
}

// =========== SMPP Server ============= //
const server = smpp.createServer((session) => {
  // TRX Binding callback and auth check
  session.on('bind_transceiver', (pdu) => {
    logger.info(`TRX bind requested by ${pdu.system_id}`);
    session.pause();
    if (pdu.system_id === settings.system_id && pdu.password === settings.password) {
      logger.info(`TRX bind succedeed for ${pdu.system_id}`);
      session.send(pdu.response());
      session.resume();
    } else {
      logger.info(`TRX bind failed for ${pdu.system_id}`);
      session.send(
        pdu.response({
          command_status: smpp.ESME_RBINDFAIL,
        }),
      );
      session.close();
    }
  });

  session.on('submit_sm', (pdu) => {
    const receivedAt = new Date();
    const randomMath = Math.floor(Math.random() * (99 - 10) + 10);
    const msgID = `${receivedAt.getTime()}-${randomMath}`;

    logger.info(`Message received with id=${msgID} and body=${pdu.short_message.message.toString()}`);

    session.send(
      pdu.response({
        message_id: msgID,
      }),
    );
    logger.info(`Sending submit_sm_resp for id=${msgID}.`);

    // Send request to ESME to confirm delivery
    setTimeout(() => {
      const status = statuses[settings.status];
      const dr = getDeliveryReceipt(
        msgID,
        status,
        receivedAt,
        new Date(),
        pdu.short_message.message.toString(),
      );
      logger.info(`delivery_sm.short_message=${dr}`);

      logger.info(
        `Sent deliver_sm for id=${msgID} with status.stat=${status.stat}, status.err=${status.err}.`,
      );
      session.deliver_sm(
        {
          source_addr: pdu.source_addr,
          source_addr_ton: pdu.source_addr_ton,
          source_addr_npi: pdu.source_addr_npi,
          dest_addr_ton: pdu.dest_addr_ton,
          dest_addr_npi: pdu.dest_addr_npi,
          destination_addr: pdu.destination_addr,
          short_message: dr,
          esm_class: smpp.ESM_CLASS.MC_DELIVERY_RECEIPT,
          sequence_number: pdu.sequence_number,
        },
        (deliveryPDU) => {
          logger.info('deliver_sm_resp received.');
        },
      );
    }, getDeliveryDelay());
  });

  // Availability check
  session.on('enquire_link', (pdu) => {
    session.send(pdu.response());
  });

  // Unbind callback
  session.on('unbind', (pdu) => {
    session.send(pdu.response());
    session.close();
  });
});

server.listen(settings.port);
logger.info(`Server is listening on ${settings.port}`);
