import express from 'express';
const router = express.Router();
import {
  getGlovesAll,
  getGlovesCutNegative,
  getGlovesBackhandLatexNeoprene,
  getGlovesWristClosureWraparound,
} from '../controllers/glovesController.js';

router.route('/').get(getGlovesAll);
router.route('/negative-cut').get(getGlovesCutNegative);
router.route('/backhand-latex-neoprene').get(getGlovesBackhandLatexNeoprene);
router.route('/wrist-closure-wraparound').get(getGlovesWristClosureWraparound);
export default router;
