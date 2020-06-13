const { ObjectId } = require('mongodb');
const getPageForCode = require('../db/getPageForCode');
const submitBsdForm = require('../services/submitBsdForm');
const apiErrorHandler = require('../utils/apiErrorHandler');
const { randomToken } = require('../utils/auth');
const validateAndNormalizeApiRequestFields = require('../utils/validateAndNormalizeApiRequestFields');
const fieldValidations = require('../../shared/fieldValidations');

const BSD_VAN_MAP = require('../utils/markeyVanFields');

const {
  BSD_CONTACT_FRIEND_ID,
  BSD_CONTACT_SUPPORT_ID,
  BSD_CONTACT_VOLUNTEER_ID,
  BSD_CONTACT_NOTE_ID,
  BSD_CONTACT_FORM_SLUG,
} = process.env;

module.exports = ({ db }) => {
  async function contact(req, res) {
    try {
      const {
        token,
        campaign,
        body: {
          firstName,
          lastName,
          email,
          phone,
          zip,
          supportLevel,
          volunteerLevel,
          note,
        },
      } = req;

      const inputs = {
        email,
        firstName,
        lastName,
        phone,
        zip,
        supportLevel,
        volunteerLevel,
        note,
      };

      const validationRequirements = {};

      Object.keys(inputs)
        .filter((key) => typeof inputs[key] !== 'undefined')
        .forEach((key) => validationRequirements[key] = inputs[key]);

      const validationResult = validateAndNormalizeApiRequestFields(
        validationRequirements,
        {
          zip: [fieldValidations.validateZipNotRequired],
          email: [fieldValidations.validateEmailNotRequired],
          phone: [fieldValidations.validatePhoneNotRequired],
        },
      );

      if (Array.isArray(validationResult)) {
        res.status(400).json({
          field: validationResult[0],
          error: validationResult[1],
        });

        return;
      }

      const signup = {
        ...validationResult,
        recruitedBy: token.user._id.toString(),
        type: 'contact',
        lastUpdatedAt: Date.now(),
      };

      const bsdPayload = {
        email: signup.email || '',
        firstname: signup.firstName,
        lastname: signup.lastName,
        phone: signup.phone,
        zip: signup.zip,
        [BSD_CONTACT_FRIEND_ID]: token.user.email,
      };

      if (signup.supportLevel) {
        bsdPayload[BSD_CONTACT_SUPPORT_ID] = BSD_VAN_MAP.support[signup.supportLevel];
      }

      if (signup.volunteerLevel) {
        bsdPayload[BSD_CONTACT_VOLUNTEER_ID] = BSD_VAN_MAP.volunteer[signup.volunteerLevel];
      }

      if (signup.note) {
        bsdPayload[BSD_CONTACT_NOTE_ID] = signup.note;
      }

      const bsdResult = await submitBsdForm(BSD_CONTACT_FORM_SLUG, bsdPayload);

      if (bsdResult instanceof Error) {
        throw bsdResult;
      }

      const hasRealEmail = !!signup.email && !!signup.email.length;

      if (!hasRealEmail) {
        const randomEmailValue = await randomToken();
        signup.email = `missing::${randomEmailValue}`;
      }

      const signups = db.collection('signups');

      await signups.updateOne(
        {
          email: signup.email,
          recruitedBy: signup.recruitedBy,
          campaign: campaign._id.toString(),
        },
        { '$set': signup },
        { upsert: true },
      );

      res.json({ ok: true });
    } catch (error) {
      apiErrorHandler(res, error);
    }
  }

  return contact;
}
