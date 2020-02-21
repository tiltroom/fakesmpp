const smpp = require("smpp");
const winston = require("winston");
const strftime = require("strftime");

const MESSAGE = Symbol.for("message");

const logger = new winston.createLogger({
  level: "info",
  format: winston.format(logsFormatter)(),
  transports: [
    new winston.transports.File({
      filename: "/var/log/fakesmpp.log",
      level: "info"
    }),
    new winston.transports.Console({
      filename: "info.logs",
      level: "info",
      timestamp: true
    })
  ]
});

const statuses = {
  delivered: { stat: "DELIVRD", err: "0" },
  provider_failure: { stat: "UNKNOWN", err: "47" },
  undelivered: { stat: "UNDELIV", err: "35" },
  phone_not_exists: { stat: "REJECTD", err: "53" },
  billing_error: { stat: "REJECTD", err: "56" },
  spam_rejected: { stat: "REJECTD", err: "57" },
  flooding: { stat: "REJECTD", err: "58" },
  blacklisted: { stat: "REJECTD", err: "60" },
  retrying: { stat: "ACCEPTD", err: "68" },
  canceled: { stat: "REJECTD", err: "82" },
  expired: { stat: "EXPIRED", err: "88" },
  deleted_by_sender: { stat: "DELETED", err: "95" },
  deleted_by_admin: { stat: "DELETED", err: "96" },
  invalid_format: { stat: "REJECTD", err: "778" }
};

const argv = require("minimist")(process.argv.slice(2), {
  default: {
    port: 2775,
    ddmin: 0,
    ddmax: 0,
    status: "delivered",
    system_id: "username",
    password: "password"
  }
});

// Delay values validation
if (argv.ddmax < argv.ddmin) {
  logger.error(
    `ddmin(${argv.ddmin}) can't be bigger than ddmax(${argv.ddmax})`
  );
  process.exit();
}

//=========== SMPP Server ============= //
const server = smpp.createServer(function(session) {
  session.on("bind_transceiver", function(pdu) {
    logger.info("bind_transceiver requested.", { system_id: pdu.system_id });

    session.on("submit_sm", function(pdu) {
      let msg_received_on = new Date();
      let r = Math.floor(Math.random() * (99 - 10) + 10);
      let msg_id = `${msg_received_on.getTime()}-${r}`;

      logger.info(
        `Msg was received, id=${msg_id} assigned. PDU:${JSON.stringify(
          pdu
        )} and body ${pdu.short_message.message.toString()}`
      );

      session.send(
        pdu.response({
          message_id: msg_id
        })
      );
      logger.info(`Send submit_sm_resp for id=${msg_id}.`);

      // Send request to ESME to confirm delivery
      setTimeout(function() {
        let status = statuses[argv.status];
        let dr = getDeliveryReceipt(
          msg_id,
          status,
          msg_received_on,
          new Date(),
          pdu.short_message.message.toString()
        );
        logger.info(`delivery_sm.short_message=${dr}`);

        logger.info(
          `Sent deliver_sm for id=${msg_id} with status.stat=${status.stat}, status.err=${status.err}.`
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
            sequence_number: pdu.sequence_number
          },
          function(pdu) {
            logger.info("deliver_sm_resp received.");
          }
        );
      }, getDeliveryDelay());
    });

    // Availability check
    session.on("enquire_link", function(pdu) {
      session.send(pdu.response());
    });
    session.on("unbind", function(pdu) {
      session.send(pdu.response());
      session.close();
    });
    // we pause the session to prevent further incoming pdu events,
    // untill we authorize the session with some async operation.
    session.pause();
    checkAsyncUserPass(pdu.system_id, pdu.password, function(err) {
      if (err) {
        logger.error("bind_transceiver failed. Incorrert credentials.");
        session.send(
          pdu.response({
            command_status: smpp.ESME_RBINDFAIL
          })
        );
        session.close();
        return;
      }
      session.send(pdu.response());
      logger.info("bind_transceiver completed successfully.", {
        system_id: pdu.system_id
      });
      session.resume();
    });
  });
});

server.listen(argv.port);
logger.info(`Server listen port #${argv.port}`);

//=========== Functions ============= //
function logsFormatter(logEntry) {
  const base = { timestamp: new Date().toUTCString() };
  const json = Object.assign(base, logEntry);
  logEntry[MESSAGE] = JSON.stringify(json);
  return logEntry;
}

function getDeliveryDelay() {
  if (argv.ddmin == argv.ddmax) {
    return argv.ddmin;
  }

  return Math.random() * (argv.ddmax - argv.ddmin) + argv.ddmin;
}

function checkAsyncUserPass(system_id, password, func) {
  if (system_id == argv.system_id && password == argv.password) {
    func(true);
  } else {
    func(false);
  }
}

function getDeliveryReceipt(msg_id, status, received_on, done_on, message) {
  let receipt = {
    id: msg_id,
    sub: "001", // not used in fact
    dlvrd: 1, // not used in fact
    "submit date": strftime("%y%m%d%H%M", received_on),
    "done date": strftime("%y%m%d%H%M", done_on),
    stat: status.stat,
    err: status.err,
    text: message.substring(0, 20) // first 20 symbols of the message
  };
  let delivery_receipt_a = [];
  for (var k in receipt) {
    delivery_receipt_a.push(k + ":" + receipt[k]);
  }

  return delivery_receipt_a.join(" ");
}

function getDeliveryReceipt(msg_id, status, received_on, done_on, message) {
  const receipt = {
    id: msg_id,
    sub: "001", // not used in fact
    dlvrd: 1, // not used in fact
    "submit date": strftime("%y%m%d%H%M", received_on),
    "done date": strftime("%y%m%d%H%M", done_on),
    stat: status.stat,
    err: status.err,
    text: message.substring(0, 20) // first 20 symbols of the message
  };
  let delivery_receipt_a = [];
  for (var k in receipt) {
    delivery_receipt_a.push(k + ":" + receipt[k]);
  }

  return delivery_receipt_a.join(" ");
}
